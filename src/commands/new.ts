import {
  CommandLinearError,
  CommandUserError,
  type Command,
} from "@/handlers/command-handler";
import { code, dueToSeconds, embedOf, yargs } from "@/utils";
import type { Options } from "yargs-parser";
import z from "zod";
import { issueToEmbed } from "@/utils/linear";
import { EmbedBuilder } from "@/utils/embed-builder";
import { linearCache } from "@/lib/linear-cache";
import { askConfirmation } from "./_confirmation";
import { Linear } from "@/lib/linear";

function parseArgs(rawArgs: string[]) {
  const argsOpt: Options = {
    alias: {
      t: "title",
      l: "labels",
      s: "state",
      desc: "description",
      d: "description",
    },
  };

  const argsSchema = z.object({
    title: z.string().min(1),
    labels: z
      .string()
      .optional()
      .transform((v) => (v ?? "").split(",").filter((s) => s.length > 0)),
    state: z.string().optional().default("Backlog"),
    description: z.string().optional().default("(no description)"),
    due: z.string().optional(),
  });

  const args = yargs(rawArgs, argsOpt);
  const parsed = argsSchema.safeParse({
    title: args.get("title"),
    labels: args.get("labels"),
    state: args.get("state"),
    description: args.get("description"),
  });

  const parsedDue = args.get("due") ? dueToSeconds(args.get("due")) : undefined;

  if (!parsed.success || parsedDue === null) {
    const issues = parsed.error?.issues.map((i) => i.message).join("\n") ?? "";
    throw new CommandUserError(
      `Invalid args: ${parsedDue === null ? "Invalid due date" : ""}\n${issues}`,
    );
  }

  return { ...parsed.data, due: parsedDue };
}

export const newIssue = {
  name: "new",
  description: "Create new issue",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  aliases: ["new", "n", "newissue", "createissue"],
  async execute(msg, _rawArgs, extra) {
    const linear = extra?.userLinear;
    const teamId = extra?.config?.teamId;
    if (!linear || !teamId)
      throw new CommandUserError("Not logged in or team not configured.");

    try {
      parseArgs(_rawArgs);
    } catch (e) {
      const prefix = await msg.client.handlers.command.getPrefix(msg);
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Usage")
        .setDescription(
          `${code(prefix + "new")} ${code("--title <title>")} [ ${code("--labels <label1>,<label2>")} ] [ ${code(
            "--state <state>",
          )} ] [ ${code("--description <description>")} ] [ ${code("--due <due date>")} ]

Example:
${prefix + 'new --title "My issue" --labels bug,feature --state backlog --description "This is a description" --due "2 days"'}
      `

            .replaceAll("[", "\\[")
            .replaceAll("]", "\\]"),
        );
      await msg.reply(embedOf(embed));
      return;
    }

    const { title, labels, state, description, due } = parseArgs(_rawArgs);

    const [validStates, validLabels] = await Promise.all([
      linearCache.teamStates.getOrSet(teamId, linear.getStatesOfTeam(teamId)),
      linearCache.teamLabels.getOrSet(teamId, linear.getLabelsOfTeam(teamId)),
    ]);

    const stateObj = validStates.find(
      (s) => s.name.toLowerCase() === state.toLowerCase(),
    );
    if (!stateObj) {
      throw new CommandUserError(
        `State ${code(state)} not found.\nValid: ${validStates.map((s) => code(s.name)).join(", ")}`,
      );
    }

    const labelIds: string[] = [];
    const fixedLabels: string[] = [];

    for (const lName of labels) {
      const match = validLabels.find((l) => l.name.toLowerCase() === lName.toLowerCase());

      if (!match) {
        const validList = validLabels.map((l) => code(l.name)).join(", ");

        throw new CommandUserError(
          `Label ${code(lName)} not found.\nValid: ${validList}`,
        );
      }

      labelIds.push(match.id);
      fixedLabels.push(match.name);
    }

    const confirmationEmbed = await issueToEmbed({
      title,
      description,
      state: stateObj.name,
      labels: fixedLabels,
      url: "",
      createdAt: new Date(),
      creatorName: msg.author.username,
    });

    const { confirmed } = await askConfirmation({
      msg,
      content: "**Are you sure?** (Expires in 2m)",
      embed: confirmationEmbed,
    });

    if (!confirmed) return;

    const { issue: _issue, success } = await linear.client.createIssue({
      title,
      description,
      teamId,
      stateId: stateObj.id,
      labelIds,
      dueDate: due ? new Date(Date.now() + due * 1000) : undefined,
    });

    if (!success) throw new CommandLinearError();

    const finalIssue = await _issue!;
    const viewer = finalIssue.creatorId
      ? await linearCache.user.getOrSet(finalIssue.creatorId, linear.client.viewer)
      : undefined;

    await msg.reply({
      content: "✅ **Issue created!**",
      ...embedOf(
        await issueToEmbed({
          title,
          description,
          state: stateObj.name,
          labels: fixedLabels,
          url: finalIssue.url,
          createdAt: finalIssue.createdAt,
          creatorPicture: viewer?.avatarUrl || undefined,
          creatorName: viewer
            ? Linear.helpers.userToStringNonEmail(viewer)
            : msg.author.username,
          identifier: finalIssue.identifier,
          updatedAt: finalIssue.updatedAt,
        }),
      ),
    });
  },
} satisfies Command;
