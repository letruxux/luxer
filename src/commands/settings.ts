import { Message } from "@fluxerjs/core";
import { db } from "../db";
import { CommandUserError, type Command } from "../handlers/command-handler";

export const settings = {
  name: "settings",
  description: "Setup permissions",
  guildOnly: true,
  adminOnly: true,
  async execute(msg: Message, args: Map<string, string>) {
    const guildId = msg.guild!.id;

    const config = await db.query.guildConfigs.findFirst({
      where: (tbl, { eq }) => eq(tbl.guildId, guildId),
    });

    if (config) {
      throw new CommandUserError("Not configured");
    }
  },
} satisfies Command;
