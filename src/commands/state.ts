import {
  CommandLinearError,
  CommandUserError,
  type Command,
} from "@/handlers/command-handler";
import { code, embedOf, parseArgsAndIssueId } from "@/utils";
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
  async execute(msg, args, extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config!.teamId!;

    const { issueId, args: filteredArgs } = await parseArgsAndIssueId(msg, args);

    const stateName = filteredArgs.join(" ").trim().toLowerCase();

    const teamStates = await linearCache.teamStates.getOrSet(
      teamId,
      linear.getStatesOfTeam(teamId),
    );

    if (stateName.length === 0) {
      const stateNames = teamStates.map((s) => code(s.name)).join(", ");
      throw new CommandUserError(`No state provided.\nValid: ${stateNames}`);
    }

    const stateObj = teamStates.find((s) => s.name.toLowerCase() === stateName);

    if (!stateObj) {
      throw new CommandUserError(
        `State ${code(stateName)} not found.\nValid: ${teamStates.map((s) => code(s.name)).join(", ")}`,
      );
    }

    const { success, issue } = await linear.client.updateIssue(issueId, {
      stateId: stateObj.id,
    });
    if (!success) throw new CommandLinearError();

    linearCache.issueState.invalidate(issueId);

    const prefix = await msg.client.handlers.command.getPrefix(msg);
    const resultIssue = await issue!;
    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle(`State updated to ${code(stateObj.name)}!`)
          .setDescription(
            `Run \`${prefix}issue ${issue ? resultIssue.identifier : issueId}\` to view the updated issue`,
          )
          .setColor(0x00ff00),
      ),
    );
  },
} satisfies Command;
