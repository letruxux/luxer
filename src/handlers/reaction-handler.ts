import {
  GuildChannel,
  type Client,
  type Message,
  type MessageReaction,
} from "@fluxerjs/core";

export interface MessageWaitingForReaction {
  allowedUserIds: string[];
  allowedEmojis: string[];
  message: Message;
  channelId: string;
  resolve: (reaction: MessageReaction) => void;
  id: string;
  timeout: NodeJS.Timeout;
}

export default class ReactionHandler {
  client: Client;

  waitingForReactions: Map<string, MessageWaitingForReaction[]> = new Map();

  constructor(client: Client) {
    this.client = client;

    this.client.on("messageReactionAdd", (reaction: MessageReaction) => {
      this.handleReaction(reaction);
    });
  }

  private handleReaction(reaction: MessageReaction) {
    if (reaction._data.user_id === this.client.user?.id) return;

    const list = this.waitingForReactions.get(reaction.messageId);
    if (!list || list.length === 0) return;

    const userId = reaction._data.user_id;
    const emojiName = reaction.emoji.name ?? "";

    for (const waiting of [...list]) {
      const isAllowedUser = waiting.allowedUserIds.includes(userId);
      const isAllowedEmoji = waiting.allowedEmojis.includes(emojiName);

      if (isAllowedUser && isAllowedEmoji) {
        waiting.resolve(reaction);
        this.cleanup(reaction.messageId, waiting.id);
        continue;
      }

      if (!userId) continue;

      const channel = this.client.channels.get(waiting.channelId);
      if (!(channel instanceof GuildChannel)) continue;

      try {
        waiting.message.removeReaction(emojiName, userId);
      } catch {}
    }
  }

  private cleanup(messageId: string, id: string) {
    const list = this.waitingForReactions.get(messageId);
    if (!list) return;

    const filtered = list.filter((w) => w.id !== id);

    if (filtered.length === 0) {
      this.waitingForReactions.delete(messageId);
    } else {
      this.waitingForReactions.set(messageId, filtered);
    }
  }

  /**```ts
const msg = ...;
const resp = await client.handlers.reaction.wait(message, {
  allowedUserIds: [interaction.user.id],
  allowedEmojis: ["👍", "👎"],
  timeout: 15000,
});

if (!reaction) {
  await msg.reply("too slow");
  return;
}

if (reaction.emoji.name === "👍") {
  await msg.reply("ok");
} else {
  await msg.reply("no");
}
```
   */
  wait(
    message: Message,
    data: Omit<
      MessageWaitingForReaction,
      "message" | "channelId" | "id" | "timeout" | "resolve"
    > & {
      timeout: number;
    },
  ): Promise<MessageReaction | null> {
    return new Promise((resolve) => {
      /* add the reactions */
      for (const emoji of data.allowedEmojis) {
        message.react(emoji);
      }
      const id = Math.random().toString(36).slice(2, 10);

      const timeout = setTimeout(() => {
        this.cleanup(message.id, id);
        resolve(null);
      }, data.timeout);

      const waiting: MessageWaitingForReaction = {
        ...data,
        message,
        channelId: message.channelId,
        id,
        timeout,
        resolve: (reaction: MessageReaction) => {
          clearTimeout(timeout);
          resolve(reaction);
        },
      };

      const existing = this.waitingForReactions.get(message.id) ?? [];
      existing.push(waiting);
      this.waitingForReactions.set(message.id, existing);
    });
  }
}
