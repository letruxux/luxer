import { Client } from "@fluxerjs/core";
import { serve } from "bun";
import { env } from "./env";
import { CommandHandler } from "./handlers/command-handler";
import { setup } from "./commands/setup";
import { reset } from "./commands/reset";
import { login, authApp } from "./commands/login";
import { user } from "./commands/user";
import EventHandler from "./handlers/event-handler";
import ReactionHandler from "./handlers/reaction-handler";
import logger from "./lib/logger";

const client = new Client({
  intents: 0,
});
const cmdHandler = new CommandHandler("l!", client);
const evHandler = new EventHandler(client);
const reactHandler = new ReactionHandler(client);
client.handlers = { command: cmdHandler, event: evHandler, reaction: reactHandler };

cmdHandler.register(setup);
cmdHandler.register(reset);
cmdHandler.register(login);
cmdHandler.register(user);

client.once("ready", async () => {
  logger.info(`${client.user?.username} ready!`);
});

client.on("messageCreate", async (msg) => {
  await cmdHandler.handleMessage(msg);
});

client.login(env.FLUXER_TOKEN!);

declare module "@fluxerjs/core" {
  interface Client {
    handlers: {
      command: CommandHandler;
      event: EventHandler;
      reaction: ReactionHandler;
    };
  }
}

serve({
  fetch: authApp.fetch,
  port: env.PORT,
});
