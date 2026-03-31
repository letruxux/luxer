import { CommandUserError, type Command } from "@/handlers/command-handler";
import { code, dueToSeconds, embedOf, yargs } from "@/utils";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EmbedBuilder } from "@/utils/embed-builder";
import { Permission } from "@/handlers/permission-handler";

export const due = {
  name: "due",
  description: "Set due date",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  requirePerms: [Permission.UPDATE_ISSUE],
  async execute(msg, args, { userLinear, config }) {
    const linear = userLinear!;

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

    const due = msg.content.split(" ").slice(1).join(" ").trim().toLowerCase();

    if (due.length === 0) {
      throw new CommandUserError("No due date provided");
    }

    const parsed = dueToSeconds(due);

    if (!parsed) {
      throw new CommandUserError("Invalid due date");
    }

    const { success, issue } = await linear.client.updateIssue(issueId, {
      dueDate: new Date(Date.now() + parsed * 1000).toISOString(),
    });
    if (!success) throw new CommandUserError("Linear API error");

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    const resultIssue = await issue!;
    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setDescription(
            `Due date updated to <t:${Math.floor(new Date(resultIssue.dueDate).getTime() / 1000)}:d>!\nRun \`${prefix}issue ${issue ? resultIssue.identifier : issueId}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
