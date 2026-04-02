import { Client } from "@fluxerjs/core";
import { commands } from "./commands/_";
import { helpCommandExecute } from "./commands/help";
import { CommandHandler, type Command } from "./handlers/command-handler";
import EventHandler from "./handlers/event-handler";
import ReactionHandler from "./handlers/reaction-handler";
import TextInputHandler from "./handlers/textinput-handler";

export default function makeBotClient() {
  const client = new Client({
    intents: 0,
  });

  const cmdHandler = new CommandHandler("l!", client);
  const evHandler = new EventHandler(client);
  const reactHandler = new ReactionHandler(client);
  const textInputHandler = new TextInputHandler(client);

  client.handlers = {
    command: cmdHandler,
    event: evHandler,
    reaction: reactHandler,
    textInput: textInputHandler,
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

  return client;
}

declare module "@fluxerjs/core" {
  interface Client {
    handlers: {
      command: CommandHandler;
      event: EventHandler;
      reaction: ReactionHandler;
      textInput: TextInputHandler;
    };
    commands: Command[];
  }
}
