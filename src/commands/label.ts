import {
  CommandLinearError,
  CommandUserError,
  type Command,
} from "@/handlers/command-handler";
import { bold, code, embedOf, parseArgsAndIssueId } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { linearCache } from "@/lib/linear-cache";
import type { IssueLabel } from "@linear/sdk";

const validSubcommands = ["add", "remove", "overwrite", "list"];

function parseInputLabels(args: string[]): string[] {
  return args
    .join(" ")
    .split(",")
    .map((e) => e.trim().toLowerCase());
}

function resolveLabelIds(
  inputLabels: string[],
  teamLabels: IssueLabel[],
): string[] | null {
  const labelIds = inputLabels.map(
    (l) => teamLabels.find((tl) => tl.name.toLowerCase() === l)?.id,
  );
  if (labelIds.some((l) => l === undefined)) {
    const notFoundLabels = inputLabels.filter(
      (l) => !teamLabels.some((tl) => tl.name.toLowerCase() === l),
    );
    throw new CommandUserError(
      `Labels ${notFoundLabels.map(code).join(", ")} not found.\nValid: ${teamLabels.map((l) => code(l.name)).join(", ")}`,
    );
  }
  return labelIds.filter((l) => l !== undefined) as string[];
}

function getNewLabelIds(
  subcommand: string,
  currentLabelIds: string[],
  validLabelIds: string[],
): string[] {
  if (subcommand === "overwrite") {
    return validLabelIds;
  } else if (subcommand === "add") {
    return Array.from(new Set([...currentLabelIds, ...validLabelIds]));
  } else if (subcommand === "remove") {
    return currentLabelIds.filter((id) => !validLabelIds.includes(id));
  }
  return validLabelIds;
}

function getActionVerb(subcommand: string): string {
  if (subcommand === "overwrite") return "overwritten";
  if (subcommand === "add") return "added";
  return "removed";
}

export const label = {
  name: "label",
  description: "Manage issue labels",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  async execute(msg, args, extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config!.teamId!;

    const { issueId, args: filteredArgs } = await parseArgsAndIssueId(msg, args);
    let subcommand = filteredArgs[0]?.toLowerCase();
    const subcommandArgs = filteredArgs.slice(1);

    const teamLabels = await linearCache.teamLabels.getOrSet(
      teamId,
      linear.getLabelsOfTeam(teamId),
    );

    const issue = await linearCache.issue.getOrSet(issueId, linear.client.issue(issueId));
    const currentLabelIds = issue?.labelIds ?? [];
    const currentLabels = teamLabels.filter((l) => currentLabelIds.includes(l.id));
    const prefix = await msg.client.handlers.command.getPrefix(msg);

    if (!subcommand) {
      subcommand = "list";
    }

    if (!validSubcommands.includes(subcommand)) {
      throw new CommandUserError(
        `Invalid subcommand. Use: ${validSubcommands.map(code).join(", ")}`,
      );
    }

    if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .addFields(
          {
            name: `${bold(issue.identifier)}'s labels`,
            value: currentLabels.length
              ? currentLabels.map((l) => code(l.name)).join(", ")
              : "None",
          },
          {
            name: "Available labels",
            value: teamLabels.length
              ? teamLabels.map((l) => code(l.name)).join(", ")
              : "No labels available",
          },
        )
        .setFooter({
          text: `Run "${prefix}label overwrite/add/remove" to edit this issue's labels`,
        })
        .setColor(0x00ff00);
      await msg.reply(embedOf(embed));
      return;
    }

    const inputLabels = parseInputLabels(subcommandArgs);

    if (inputLabels.length === 0 || inputLabels[0] === "") {
      throw new CommandUserError("No labels provided");
    }

    const validLabelIds = resolveLabelIds(inputLabels, teamLabels);
    if (!issue) throw new CommandUserError("Issue not found");
    if (!validLabelIds) throw new CommandUserError("Issue not found");

    const newLabelIds = getNewLabelIds(subcommand, currentLabelIds, validLabelIds);

    const { success } = await linear.client.updateIssue(issueId, {
      labelIds: newLabelIds,
    });
    if (!success) throw new CommandLinearError();

    linearCache.issueLabels.invalidate(issueId);

    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle(`Labels ${getActionVerb(subcommand)}!`)
          .setDescription(
            `Run \`${prefix}issue ${issue.identifier}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
