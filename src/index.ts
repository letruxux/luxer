import { Client } from "@fluxerjs/core";
import { serve } from "bun";
import { env } from "./env";
import { CommandHandler } from "./handlers/command-handler";
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
import { issue } from "./commands/issue";
import { label } from "./commands/label";
import { logout } from "./commands/logout";

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

cmdHandler.register(setup);
cmdHandler.register(reset);
cmdHandler.register(login);
cmdHandler.register(user);
cmdHandler.register(newIssue);
cmdHandler.register(issue);
cmdHandler.register(label);
cmdHandler.register(logout);

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
  }
}

serve({
  fetch: authApp.fetch,
  port: env.PORT,
});
