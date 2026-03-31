import { CommandUserError, type Command } from "@/handlers/command-handler";
import { code, embedOf, yargs } from "@/utils";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
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
    if (!success) throw new CommandUserError("Linear API error");

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setDescription(
            `Labels updated! Run \`${prefix}issue ${issue ? (await issue).identifier : issueId}\` to view the updated issue`,
          )
          .setDescription(
            `Labels updated to ${labels.map(code).join(", ")}!\nRun \`${prefix}issue ${issue ? (await issue).identifier : issueId}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
