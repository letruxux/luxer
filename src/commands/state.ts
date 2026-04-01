import { CommandUserError, type Command } from "@/handlers/command-handler";
import { code, embedOf, filterIdArg, yargs } from "@/utils";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EmbedBuilder } from "@/utils/embed-builder";
import { Permission } from "@/handlers/permission-handler";
import { linearCache } from "@/lib/linear-cache";

export const state = {
  name: "state",
  description: "Set issue state",
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

    const stateName = filterIdArg(args).join(" ").trim().toLowerCase();

    if (stateName.length === 0) {
      throw new CommandUserError("No state provided");
    }

    const teamStates = await linearCache.getOrSetTeamStates(
      teamId,
      linear.getStatesOfTeam(teamId),
    );

    const stateObj = teamStates.find((s) => s.name.toLowerCase() === stateName);

    if (!stateObj) {
      throw new CommandUserError(
        `State ${code(stateName)} not found.\nValid: ${teamStates.map((s) => code(s.name)).join(", ")}`,
      );
    }

    const { success, issue } = await linear.client.updateIssue(issueId, {
      stateId: stateObj.id,
    });
    if (!success) throw new CommandUserError("Linear API error");

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    const resultIssue = await issue!;
    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setDescription(
            `State updated to ${code(stateObj.name)}!\nRun \`${prefix}issue ${issue ? resultIssue.identifier : issueId}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
