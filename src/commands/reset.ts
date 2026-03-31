import { db } from "@/db";
import { guildConfigs } from "@/db/schema";
import { type Command } from "@/handlers/command-handler";
import { eq } from "drizzle-orm";
import { embedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";

export const reset = {
  name: "reset",
  description: "Reset this community",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  async execute(msg) {
    const guildId = msg.guild!.id;

    await db.delete(guildConfigs).where(eq(guildConfigs.guildId, guildId));

    await msg.reply(
      embedOf(new EmbedBuilder().setDescription("Community reset, run setup again!")),
    );
  },
} satisfies Command;
