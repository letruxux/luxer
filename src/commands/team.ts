import type { Command } from "@/handlers/command-handler";
import { code, embedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";

export const team = {
  name: "team",
  description: "Show team info, states and labels",
  requireConfig: true,
  requireAccountLinked: true,
  guildOnly: true,
  async execute(msg, _, { config, userLinear }) {
    const linear = userLinear!;
    const teamId = config!.teamId!;

    const team = await linear.client.team(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const states = await linear.getStatesOfTeam(teamId);
    const labels = await linear.getLabelsOfTeam(teamId);

    const teamInfo = [
      `**Key:** ${code(team.key ?? "(none)")}`,
      `**Description:** ${code(team.description ?? "(none)")}`,
    ].join("\n");

    const stateList = states.length
      ? states.map((s) => code(s.name)).join(", ")
      : "No states";
    const labelList = labels.length
      ? labels.map((l) => code(l.name)).join(", ")
      : "No labels";

    const embed = new EmbedBuilder()
      .setTitle(`${team.name} - Team on Linear`)
      .setDescription(teamInfo)
      .addFields(
        { name: "States", value: stateList, inline: true },
        { name: "Labels", value: labelList, inline: true },
      );

    await msg.reply(embedOf(embed));
  },
} satisfies Command;
