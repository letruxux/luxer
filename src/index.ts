import { Client } from "@fluxerjs/core";
import { serve } from "bun";
import { env } from "./env";
import { CommandHandler, type Command } from "./handlers/command-handler";
import { setup } from "./commands/setup";
import { reset } from "./commands/reset";
import { login } from "./commands/login";
import { user } from "./commands/user";
import EventHandler from "./handlers/event-handler";
import ReactionHandler from "./handlers/reaction-handler";
import logger from "./lib/logger";
import { PermissionHandler } from "./handlers/permission-handler";
import { authApp } from "./login-http";
import { newIssue } from "./commands/new";
import { label } from "./commands/label";
import { logout } from "./commands/logout";
import { db } from "./db";
import { role } from "./commands/role";
import { issues } from "./commands/issues";
import { due } from "./commands/due";
import { helpCommandExecute } from "./commands/help";

const client = new Client({
  intents: 0,
});

const cmdHandler = new CommandHandler("l!", client);
const evHandler = new EventHandler(client);
const reactHandler = new ReactionHandler(client);
const permsHandler = new PermissionHandler();

client.handlers = {
  command: cmdHandler,
  event: evHandler,
  reaction: reactHandler,
  perms: permsHandler,
};

client.commands = [setup, reset, login, user, newIssue, label, logout, issues, due, role];

for (const cmd of client.commands) {
  cmdHandler.register(cmd);
}
cmdHandler.register({
  name: "help",
  aliases: ["h"],
  description: "get help",
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
      perms: PermissionHandler;
    };
    commands: Command[];
  }
}

const server = serve({
  fetch: authApp.fetch,
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
