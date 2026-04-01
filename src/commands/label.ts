import { CommandLinearError, CommandUserError, type Command } from "@/handlers/command-handler";
import { code, embedOf, parseArgsAndIssueId } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { Permission } from "@/handlers/permission-handler";
import { linearCache } from "@/lib/linear-cache";

export const label = {
  name: "label",
  description: "Set labels (comma separated)",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  requirePerms: [Permission.UPDATE_ISSUE],
  async execute(msg, args, { userLinear, config }) {
    const linear = userLinear!;
    const teamId = config!.teamId!;

    const { issueId, args: filteredArgs } = await parseArgsAndIssueId(msg, args);

    const labels = filteredArgs
      .join(" ")
      .split(",")
      .map((e) => e.trim().toLowerCase());

    if (labels.length === 0) {
      throw new CommandUserError("No labels provided");
    }

    const teamLabels = await linearCache.getOrSetTeamLabels(
      teamId,
      linear.getLabelsOfTeam(teamId),
    );
    const labelIds = labels.map(
      (l) => teamLabels.find((tl) => tl.name.toLowerCase() === l)?.id,
    );
    if (labelIds.some((l) => l === undefined)) {
      const notFoundLabels = labels.filter(
        (l) => !teamLabels.some((tl) => tl.name.toLowerCase() === l),
      );
      throw new CommandUserError(
        `Labels ${notFoundLabels.map(code).join(", ")} not found.\nValid: ${teamLabels.map((l) => code(l.name)).join(", ")}`,
      );
    }

    const { success, issue } = await linear.client.updateIssue(issueId, {
      labelIds: labelIds.filter((l) => l !== undefined),
    });
    if (!success) throw new CommandLinearError();

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    const issueResult = await issue!;
    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle(`Labels updated to ${labels.map(code).join(", ")}!`)
          .setDescription(
            `Run \`${prefix}issue ${issue ? issueResult.identifier : issueId}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
