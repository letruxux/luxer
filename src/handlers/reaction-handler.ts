import {
  GuildChannel,
  type Client,
  type Message,
  type MessageReaction,
} from "@fluxerjs/core";

export const EMOJIS = {
  YES: "✅",
  NO: "❌",
  RENAME: "✏️",
  DELETE: "🗑️",
  BACK: "↩️",
  NEW: "➕",
  ARCHIVE: "🗃️",
};

export const YES_NO_EMOJIS = [EMOJIS.YES, EMOJIS.NO];
export const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

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
  private reactionsCache: Map<string, Set<string>> = new Map();

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

    for (const waiting of list) {
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

  public clearReactionCacheForMessage(messageId: string) {
    this.reactionsCache.delete(messageId);
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

  wait(
    message: Message,
    data: Omit<
      MessageWaitingForReaction,
      "message" | "channelId" | "id" | "timeout" | "resolve"
    > & {
      timeout: number;
    },
  ): Promise<MessageReaction | null> {
    return new Promise(async (resolve) => {
      for (const emoji of data.allowedEmojis) {
        const cached = this.reactionsCache.get(message.id) ?? new Set();

        if (cached.has(emoji)) continue;

        await message.react(emoji);

        cached.add(emoji);
        this.reactionsCache.set(message.id, cached);
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
