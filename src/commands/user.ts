import { Message } from "@fluxerjs/core";
import { db } from "../db";
import { Linear } from "../linear";
import { CommandUserError, type Command } from "../handlers/command-handler";
import { code } from "../utils";
import { EmbedBuilder } from "../embed-builder";

export const user = {
  name: "user",
  description: "Get user",
  async execute(msg: Message, args: Map<string, string>) {
    const tokenRecord = await db.query.userTokens.findFirst({
      where: (tbl, { eq }) => eq(tbl.userId, msg.author.id),
    });

    if (!tokenRecord) {
      throw new CommandUserError("Not logged in");
    }

    const user = await new Linear(tokenRecord.linearToken).getViewer();

    const embed = new EmbedBuilder()
      .setDescription(code(user.email))
      .setThumbnail(user.avatarUrl ?? "")
      .setTimestamp()
      .setTitle(user.name);

    await msg.reply({ embeds: [embed] });
  },
} satisfies Command;
