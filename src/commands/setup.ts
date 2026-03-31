import { TextChannel } from "@fluxerjs/core";
import { db } from "@/db";
import { guildConfigs } from "@/db/schema";
import { CommandUserError, type Command } from "@/handlers/command-handler";
import { embedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { NUMBER_EMOJIS } from "@/handlers/reaction-handler";

export const setup = {
  name: "setup",
  description: "Setup Linear!",
  guildOnly: true,
  adminOnly: true,
  requireAccountLinked: true,
  async execute(msg, _, { userLinear }) {
    const guildId = msg.guild!.id;
    const channel = msg.channel as TextChannel;

    const existing = await db.query.guildConfigs.findFirst({
      where: (tbl, { eq }) => eq(tbl.guildId, guildId),
    });

    if (existing) {
      throw new CommandUserError("Already configured!");
    }

    let teams: { id: string; name: string }[];

    try {
      const rawTeams = await userLinear!.getTeams();
      teams = rawTeams.slice(0, 10).map((t) => ({ id: t.id, name: t.name }));
    } catch {
      throw new CommandUserError("Invalid API key");
    }

    if (!teams.length) {
      throw new CommandUserError("No teams found on your Linear account");
    }

    const emojis = NUMBER_EMOJIS.slice(0, teams.length);
    const teamList = teams.map((team, i) => `${emojis[i]} **${team.name}**`).join("\n");

    const message = await channel.send(
      embedOf(new EmbedBuilder().setTitle("Select your team").setDescription(teamList)),
    );

    for (const emoji of emojis) {
      await message.react(emoji).catch(() => {});
    }

    const reaction = await msg.client.handlers.reaction.wait(message, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: emojis,
      timeout: 120000,
    });

    if (!reaction) {
      await channel.send(
        msg.client.handlers.command.buildErrorPayload(
          "Took too long! Please do the command again",
        ),
      );
      return;
    }

    message.removeAllReactions().catch(() => {});

    const selectedIndex = emojis.indexOf(reaction.emoji.name ?? "");
    const selectedTeam = teams[selectedIndex];
    if (!selectedTeam) throw new CommandUserError("Invalid selection");

    await db
      .insert(guildConfigs)
      .values({ guildId, teamId: selectedTeam.id })
      .onConflictDoUpdate({
        target: guildConfigs.guildId,
        set: { teamId: selectedTeam.id },
      });

    await message.edit(
      embedOf(new EmbedBuilder().setColor(0x00ff00).setDescription("Ready!")),
    );
  },
} satisfies Command;
