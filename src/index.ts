import { Client } from "@fluxerjs/core";
import { serve } from "bun";
import { env } from "./env";
import { CommandHandler, type Command } from "./handlers/command-handler";
import EventHandler from "./handlers/event-handler";
import ReactionHandler from "./handlers/reaction-handler";
import TextInputHandler from "./handlers/textinput-handler";
import logger from "./lib/logger";
import { PermissionHandler } from "./handlers/permission-handler";
import authRoutes from "./lib/auth-routes";
import { db } from "./db";
import webhookRoutes from "./lib/webhook/routes";
import { Hono } from "hono";
import { commands, helpCommandExecute } from "./commands/_";

const http = new Hono();

http.route("/callback", authRoutes);
http.route("/webhook", webhookRoutes);

const client = new Client({
  intents: 0,
});

const cmdHandler = new CommandHandler("l!", client);
const evHandler = new EventHandler(client);
const reactHandler = new ReactionHandler(client);
const textInputHandler = new TextInputHandler(client);
const permsHandler = new PermissionHandler();

client.handlers = {
  command: cmdHandler,
  event: evHandler,
  reaction: reactHandler,
  textInput: textInputHandler,
  perms: permsHandler,
};

client.commands = commands;

for (const cmd of client.commands) {
  cmdHandler.register(cmd);
}
cmdHandler.register({
  name: "help",
  aliases: ["h"],
  description: "Get help",
  execute: helpCommandExecute,
});

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
      textInput: TextInputHandler;
      perms: PermissionHandler;
    };
    commands: Command[];
  }
}

const server = serve({
  fetch: http.fetch,
  port: env.PORT,
});

async function shutdown() {
  logger.info("Shutting down...");
  await server.stop();

  db.$client.close();

  await client.destroy();

  logger.info("Bye!");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
