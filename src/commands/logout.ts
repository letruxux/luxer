import { type Command } from "../handlers/command-handler";
import { embedOf } from "../utils";
import { db } from "../db";
import { EmbedBuilder } from "../utils/embed-builder";
import { userTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { YES_EMOJI, YES_NO_EMOJIS } from "../handlers/reaction-handler";

export const logout = {
  name: "logout",
  description: "Logout from Linear",
  requireAccountLinked: true,
  async execute(msg, _, {}) {
    const respMsg = await msg.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription("**Are you sure you want to logout?** (Expires in 2m)")
          .setColor(0xff0000),
      ],
    });
    const resp = await msg.client.handlers.reaction.wait(respMsg, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: YES_NO_EMOJIS,
      timeout: 120_000,
    });

    if (!resp || resp.emoji.name !== YES_EMOJI) {
      await respMsg.edit({ content: "❌ Canceled", embeds: [] });
      await respMsg.removeAllReactions();
      return;
    }
    respMsg.removeAllReactions();

    await db.delete(userTokens).where(eq(userTokens.userId, msg.author.id)).execute();

    await respMsg.edit(
      embedOf(new EmbedBuilder().setDescription("Logged out!").setColor(0x00ff00)),
    );
  },
} satisfies Command;
