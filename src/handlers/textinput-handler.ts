import { type Client, type Message } from "@fluxerjs/core";

export interface MessageWaitingForMessage {
  allowedUserId: string;
  channelId: string;
  resolve: (message: Message) => void;
  id: string;
  timeout: NodeJS.Timeout;
}

export default class TextInputHandler {
  client: Client;
  waitingForMessages: Map<string, MessageWaitingForMessage[]> = new Map();

  constructor(client: Client) {
    this.client = client;

    this.client.on("messageCreate", (message: Message) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: Message) {
    if (message.author.id === this.client.user?.id) return;

    const list = this.waitingForMessages.get(message.channelId);
    if (!list || list.length === 0) return;

    for (const waiting of [...list]) {
      if (waiting.allowedUserId === message.author.id) {
        waiting.resolve(message);
        this.cleanupMessage(message.channelId, waiting.id);
        continue;
      }
    }
  }

  private cleanupMessage(channelId: string, id: string) {
    const list = this.waitingForMessages.get(channelId);
    if (!list) return;

    const filtered = list.filter((w) => w.id !== id);

    if (filtered.length === 0) {
      this.waitingForMessages.delete(channelId);
    } else {
      this.waitingForMessages.set(channelId, filtered);
    }
  }

  waitForMessage(
    channelId: string,
    data: {
      allowedUserId: string;
      timeout: number;
    },
  ): Promise<Message | null> {
    return new Promise(async (resolve) => {
      const id = Math.random().toString(36).slice(2, 10);

      const timeout = setTimeout(() => {
        this.cleanupMessage(channelId, id);
        resolve(null);
      }, data.timeout);

      const waiting: MessageWaitingForMessage = {
        ...data,
        channelId,
        id,
        timeout,
        resolve: (message: Message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      };

      const existing = this.waitingForMessages.get(channelId) ?? [];
      existing.push(waiting);
      this.waitingForMessages.set(channelId, existing);
    });
  }
}