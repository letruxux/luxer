import { CommandLinearError, CommandUserError, type Command } from "@/handlers/command-handler";
import { code, dueToSeconds, embedOf, parseArgsAndIssueId } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { Permission } from "@/handlers/permission-handler";

export const due = {
  name: "due",
  description: "Set due date",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  requirePerms: [Permission.UPDATE_ISSUE],
  async execute(msg, args, { userLinear }) {
    const linear = userLinear!;

    const { issueId, args: filteredArgs } = await parseArgsAndIssueId(msg, args);

    const due = filteredArgs.join(" ").trim().toLowerCase();

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
    if (!success) throw new CommandLinearError();

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
