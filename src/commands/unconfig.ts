import { Message } from "@fluxerjs/core";
import { db } from "../db";
import { guildConfigs } from "../schema";
import { CommandUserError, type Command } from "../handlers/command-handler";
import { eq } from "drizzle-orm";

export const unconfig = {
  name: "unconfig",
  description: "Remove this community",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  async execute(msg: Message) {
    const guildId = msg.guild!.id;

    await db.delete(guildConfigs).where(eq(guildConfigs.guildId, guildId));

    await msg.reply("Ok");
  },
} satisfies Command;
