import type { Message } from "@fluxerjs/core";
import { textEmbedOf } from "@/utils";
import { EMOJIS, YES_NO_EMOJIS } from "@/handlers/reaction-handler";

const INTERACTION_TIMEOUT = 120_000;

export async function handleTimeout(msgResp: Message, errorMessage = "Took too long!") {
  await msgResp.edit(textEmbedOf(errorMessage, { color: 0xff0000 }));
  msgResp.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
  await msgResp.removeAllReactions();
}

export async function confirmAction(
  msg: Message,
  msgResp: Message,
  question: string,
): Promise<boolean> {
  await msgResp.edit({
    embeds: [
      new (await import("@/utils/embed-builder")).EmbedBuilder()
        .setTitle(question)
        .setDescription("React with ✅ to confirm or ❌ to cancel")
        .setColor(0xffaa00),
    ],
  });

  const confirmResp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: YES_NO_EMOJIS,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!confirmResp || confirmResp.emoji.name !== EMOJIS.YES) {
    return false;
  }

  await msgResp.removeAllReactions();
  return true;
}

export async function waitForTextInput(
  msg: Message,
  msgResp: Message,
  prompt: string,
): Promise<string | null> {
  await msgResp.edit(
    textEmbedOf("Send the new name (or 'cancel' to abort)", {
      title: prompt,
    }),
  );
  msgResp.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);

  const nameMsg = await msg.client.handlers.textInput.waitForMessage(msg.channelId, {
    allowedUserId: msg.author.id,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!nameMsg) {
    await handleTimeout(msgResp);
    return null;
  }

  const content = nameMsg.content.trim();
  await nameMsg.delete();
  return content;
}

export function normalizeCancel(text: string | null): text is null {
  return text?.toLowerCase() === "cancel" || !text;
}
