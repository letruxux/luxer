import type { Message } from "@fluxerjs/core";
import { YES_EMOJI, YES_NO_EMOJIS } from "@/handlers/reaction-handler";
import { embedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";


export async function askConfirmation({
  msg,
  content = "**Are you sure?** (Expires in 2m)",
  embed,
  customEmojis,
  timeout = 120_000,
}: {
  msg: Message;
  content?: string;
  embed?: EmbedBuilder;
  customEmojis?: string[];
  timeout?: number;
}): Promise<{
  confirmed: boolean;
  message: Message;
}> {
  const embeds = embed ? [embed] : undefined;

  const respMsg = await msg.reply({
    content,
    embeds,
  });

  const allowedEmojis = customEmojis ?? YES_NO_EMOJIS;

  const resp = await msg.client.handlers.reaction.wait(respMsg, {
    allowedUserIds: [msg.author.id],
    allowedEmojis,
    timeout,
  });

  if (!resp) {
    await respMsg.edit(
      embedOf(new EmbedBuilder().setDescription("Took too long!").setColor(0xff0000)),
    );
    await respMsg.removeAllReactions();
    return { confirmed: false, message: respMsg };
  }

  const confirmed = customEmojis
    ? resp.emoji.name === customEmojis[0]
    : resp.emoji.name === YES_EMOJI;

  if (!confirmed) {
    await respMsg.edit({
      content: "",
      embeds: [msg.client.handlers.command.buildErrorEmbed("Cancelled")],
    });
    await respMsg.removeAllReactions();
    return { confirmed: false, message: respMsg };
  }

  await respMsg.removeAllReactions();
  return { confirmed: true, message: respMsg };
}
