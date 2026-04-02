import { type Message } from "@fluxerjs/core";
import { type Command } from "@/handlers/command-handler";
import { textEmbedOf } from "@/utils";
import { handleLabels } from "./labels";
import { handleStates } from "./states";

export const manage = {
  name: "manage",
  description: "Manage team labels and states",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  requireAccountLinked: true,

  aliases: [],
  async execute(msg: Message, args: string[], extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config!.teamId!;
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || !["labels", "states"].includes(subcommand)) {
      const prefix = await msg.client.handlers.command.getPrefix(msg);
      await msg.reply(
        textEmbedOf(
          `Use \`${prefix}manage labels\` or \`${prefix}manage states\` to manage team labels or states.`,
          { title: "Manage command" },
        ),
      );
      return;
    }

    if (subcommand === "labels") {
      await handleLabels(msg, args, linear, teamId);
    } else if (subcommand === "states") {
      await handleStates(msg, args, linear, teamId);
    }
  },
} satisfies Command;