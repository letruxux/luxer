import type { Client } from "@fluxerjs/core";
import type { BotEvent } from "../types";

export default class EventHandler {
  client: Client;
  events = new Map<string, BotEvent[]>();

  constructor(client: Client) {
    this.client = client;
  }

  register(event: BotEvent): void {
    if (event.once) this.client.once(event.name, event.execute);
    else this.client.on(event.name, event.execute);

    const events = this.events.get(event.name) ?? [];
    events.push(event);

    this.events.set(event.name, events);
  }
}
