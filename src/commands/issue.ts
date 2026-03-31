import { db } from "../db";
import { Linear } from "../lib/linear";
import { CommandUserError, type Command } from "../handlers/command-handler";
import { code, dueToSeconds, embedOf, yargs } from "../utils";
import { EmbedBuilder } from "../utils/embed-builder";
import type { Options } from "yargs-parser";
import z from "zod";
import { issueToEmbed } from "../utils/linear";

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

export const issue = {
  name: "issue",
  description: "Create new issue",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  async execute(msg, _rawArgs, config) {
    const tokenRecord = await db.query.userTokens.findFirst({
      where: (tbl, { eq }) => eq(tbl.userId, msg.author.id),
    });

    if (!tokenRecord) {
      throw new CommandUserError("Not logged in");
    }

    const linear = new Linear(tokenRecord.linearToken);

    const args = yargs(_rawArgs, argsOpt);
    const {
      success: parseSuccess,
      data,
      error,
    } = argsSchema.safeParse({
      title: args.get("title"),
      labels: args.get("labels"),
      state: args.get("state"),
      description: args.get("description"),
    });

    const parsedDue = args.get("due") ? dueToSeconds(args.get("due")) : undefined;

    if (!parseSuccess || !data || parsedDue === null) {
      let msg = "Invalid args";
      if (parsedDue === null) {
        msg += "\nInvalid due date";
      }
      for (const err of error?.issues ?? []) {
        msg += `\n${err.message}`;
      }
      throw new CommandUserError(msg);
    }

    const { title, labels, state, description } = data;

    if (!title) {
      throw new CommandUserError("Missing title");
    }

    const confirmationEmbed = issueToEmbed({
      title,
      description,
      state,
      labels,
      url: "",
      createdAt: new Date(),
      creatorName: msg.author.username,
    });

    const respMsg = await msg.reply({
      content:
        "Are you sure? (2 minutes to decide or it will be automatically discarded)",
      embeds: [confirmationEmbed],
    });

    const resp = await msg.client.handlers.reaction.wait(respMsg, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: ["👍", "👎"],
      timeout: 120_000,
    });

    if (!resp) {
      await respMsg.edit(msg.client.handlers.command.buildErrorPayload("Took too long!"));
      return;
    }

    if (resp.emoji.name !== "👍") {
      await respMsg.edit(msg.client.handlers.command.buildErrorPayload("Cancelled"));
      return;
    }

    const validStates = await linear.getStatesOfTeam(config!.teamId!);

    const statesMap = new Map(validStates.map((s) => [s.name.toLowerCase(), s]));

    const stateObj = statesMap.get(state.toLowerCase());

    if (!stateObj) {
      throw new CommandUserError(
        `The state ${code(state)} doesn't exist!\nAvailable states: ${validStates
          .map((l) => code(l.name))
          .join(", ")}`,
      );
    }

    const validLabels = await linear.getLabelsOfTeam(config!.teamId!);

    const labelsMap = new Map(validLabels.map((l) => [l.name.toLowerCase(), l]));

    const fixedLabels: string[] = [];
    const labelIds: string[] = [];

    for (const label of labels) {
      const labelObj = labelsMap.get(label.toLowerCase());

      if (!labelObj) {
        throw new CommandUserError(
          `The label ${code(label)} doesn't exist!\nAvailable labels: ${validLabels
            .map((l) => code(l.name))
            .join(", ")}`,
        );
      }

      fixedLabels.push(labelObj.name);
      labelIds.push(labelObj.id);
    }

    const { issue: _issue, success } = await linear.client.createIssue({
      title,
      description,
      teamId: config!.teamId!,
      stateId: stateObj.id,
      labelIds,
    });

    if (!success) {
      throw new CommandUserError("Failed to create issue...");
    }

    const issue = await _issue!;
    const member = await linear.getViewer();

    await respMsg.edit({
      content: "Issue created!",
      ...embedOf(
        issueToEmbed({
          title,
          description,
          state: stateObj.name,
          labels: fixedLabels,
          url: issue.url,
          createdAt: issue.createdAt,
          creatorPicture: member?.avatarUrl || undefined,
          creatorName: member ? member.name : msg.author.username,
          identifier: issue.identifier,
          updatedAt: issue.updatedAt,
        }),
      ),
    });
  },
} satisfies Command;
