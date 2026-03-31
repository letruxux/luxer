import { CommandUserError, type Command } from "../handlers/command-handler";
import { code, dueToSeconds, embedOf, yargs } from "../utils";
import type { Options } from "yargs-parser";
import z from "zod";
import { issueToEmbed } from "../utils/linear";

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

export const issue = {
  name: "issue",
  description: "Create new issue",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  async execute(msg, _rawArgs, extra) {
    const linear = extra?.userLinear;
    const teamId = extra?.config?.teamId;
    if (!linear || !teamId)
      throw new CommandUserError("Not logged in or team not configured.");

    const { title, labels, state, description, due } = parseArgs(_rawArgs);

    const [validStates, validLabels] = await Promise.all([
      linear.getStatesOfTeam(teamId),
      linear.getLabelsOfTeam(teamId),
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

    const confirmationEmbed = issueToEmbed({
      title,
      description,
      state: stateObj.name,
      labels: fixedLabels,
      url: "",
      createdAt: new Date(),
      creatorName: msg.author.username,
    });

    const respMsg = await msg.reply({
      content: "**Are you sure?** (Expires in 2m)",
      embeds: [confirmationEmbed],
    });

    const resp = await msg.client.handlers.reaction.wait(respMsg, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: ["👍", "👎"],
      timeout: 120_000,
    });

    if (!resp || resp.emoji.name !== "👍") {
      await respMsg.edit({ content: "❌ Canceled", embeds: [] });
      await respMsg.removeAllReactions();
      return;
    }

    const { issue: _issue, success } = await linear.client.createIssue({
      title,
      description,
      teamId,
      stateId: stateObj.id,
      labelIds,
      dueDate: due ? new Date(Date.now() + due * 1000) : undefined,
    });

    if (!success) throw new CommandUserError("Linear API error");

    const finalIssue = await _issue!;
    const viewer = await linear.getViewer();

    await respMsg.edit({
      content: "✅ **Issue created!**",
      ...embedOf(
        issueToEmbed({
          title,
          description,
          state: stateObj.name,
          labels: fixedLabels,
          url: finalIssue.url,
          createdAt: finalIssue.createdAt,
          creatorPicture: viewer?.avatarUrl || undefined,
          creatorName: viewer?.name || msg.author.username,
          identifier: finalIssue.identifier,
          updatedAt: finalIssue.updatedAt,
        }),
      ),
    });
  },
} satisfies Command;
