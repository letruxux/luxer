import { Message } from "@fluxerjs/core";
import { db } from "../db";
import { guildConfigs } from "../db/schema";
import { type Command } from "../handlers/command-handler";
import { eq } from "drizzle-orm";

export const reset = {
  name: "reset",
  description: "Reset this community",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  async execute(msg) {
    const guildId = msg.guild!.id;

    await db.delete(guildConfigs).where(eq(guildConfigs.guildId, guildId));

    await msg.reply("Ok");
  },
} satisfies Command;
