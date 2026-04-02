import { type Command } from "@/handlers/command-handler";
import { embedOf } from "@/utils";
import { db } from "@/db";
import { EmbedBuilder } from "@/utils/embed-builder";
import { userTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { askConfirmation } from "./_confirmation";

export const logout = {
  name: "logout",
  description: "Logout from Linear",
  requireAccountLinked: true,
  async execute(msg) {
    const { confirmed } = await askConfirmation({
      msg,
      embed: new EmbedBuilder()
        .setDescription("**Are you sure you want to logout?** (Expires in 2m)")
        .setColor(0xff0000),
    });

    if (!confirmed) return;

    await db.delete(userTokens).where(eq(userTokens.userId, msg.author.id)).execute();

    await msg.reply(
      embedOf(new EmbedBuilder().setDescription("Logged out!").setColor(0x00ff00)),
    );
  },
} satisfies Command;
