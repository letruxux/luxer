import { nanoid } from "nanoid";
import { env } from "../env";
import { CommandUserError, type Command } from "../handlers/command-handler";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  addStateLogin,
} from "../login-http";
import { code, embedOf, yargs } from "../utils";
import { db } from "../db";
import { issueIdsMessages } from "../db/schema";
import { eq } from "drizzle-orm";
import { EmbedBuilder } from "../utils/embed-builder";

export const label = {
  name: "label",
  description: "Set labels (comma separated)",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  async execute(msg, args, { userLinear, config }) {
    const linear = userLinear!;
    const teamId = config!.teamId!;

    const issueId = msg.referencedMessage
      ? await db
          .select()
          .from(issueIdsMessages)
          .where(eq(issueIdsMessages.messageId, msg.referencedMessage!.id))
          .limit(1)
          .execute()
          .then((e) => e[0]?.issueId ?? undefined)
      : (yargs(args, { alias: { i: "id" } }).get("id") as string | undefined);

    if (!issueId) {
      throw new CommandUserError(
        "No issue provided, either reply to an issue or use the `--id <ABC-123>` flag",
      );
    }

    const labels = msg.content
      .split(" ")
      .slice(1)
      .join(" ")
      .split(",")
      .map((e) => e.trim().toLowerCase());
    const teamLabels = await linear.getLabelsOfTeam(teamId);
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

    const { success } = await linear.client.updateIssue(issueId, {
      labelIds: labelIds.filter((l) => l !== undefined),
    });
    if (!success) throw new CommandUserError("Linear API error");

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    await msg.reply(
      embedOf(
        new EmbedBuilder().setDescription(
          `Labels updated! Run \`${prefix}issue ${issueId}\` to view the updated issue`,
        ),
      ),
    );
  },
} satisfies Command;
