import { Message, TextChannel } from "@fluxerjs/core";
import { db } from "../db";
import { guildConfigs } from "../db/schema";
import { Linear } from "../linear";
import { CommandUserError, type Command } from "../handlers/command-handler";
import { code } from "../utils";

const NUMEMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

export const setup = {
  name: "setup",
  description: "Setup Linear!",
  guildOnly: true,
  adminOnly: true,
  async execute(msg: Message, args: Map<string, string>) {
    const guildId = msg.guild!.id;
    const channel = msg.channel as TextChannel;
    const key = args.get("key");

    const existing = await db.query.guildConfigs.findFirst({
      where: (tbl, { eq }) => eq(tbl.guildId, guildId),
    });

    if (existing) {
      throw new CommandUserError("Already configured!");
    }

    if (!key) {
      await msg.reply(code("l!setup --key <KEY>"));
      return;
    }

    const linearClient = new Linear(key);
    let teams: { id: string; name: string }[];

    try {
      const rawTeams = await linearClient.getTeams();
      teams = rawTeams.slice(0, 5).map((t) => ({ id: t.id, name: t.name }));
    } catch {
      throw new CommandUserError("Invalid API key");
    }

    if (!teams.length) {
      throw new CommandUserError("No teams found on your Linear account");
    }

    const emojis = NUMEMOJIS.slice(0, teams.length);
    const teamList = teams.map((team, i) => `${emojis[i]} **${team.name}**`).join("\n");

    const message = await channel.send({
      content: `### Select your team:\n${teamList}`,
    });

    for (const emoji of emojis) {
      await message.react(emoji).catch(() => {});
    }

    const reaction = await msg.client.handlers.reaction.wait(message, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: emojis,
      timeout: 120000,
    });

    if (!reaction) {
      await channel.send({
        content: `Took too long!!!`,
      });
      return;
    }

    /* remove all reactions */
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

    await message.edit({
      content: `Ready!`,
    });
  },
} satisfies Command;
