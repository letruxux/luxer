import { CommandUserError, type Command } from "@/handlers/command-handler";
import { code } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import type { Message } from "@fluxerjs/core";

function commandToEmojis(cmd: Command) {
  const emojis: string[] = [];
  if (cmd.adminOnly) emojis.push("🛡️");
  if (cmd.requireConfig) emojis.push("🧢");
  if (cmd.requireAccountLinked) emojis.push("🔑");
  return emojis.join("") + " ";
}

async function helpGeneralEmbed(msg: Message, pref: string) {
  const embed = new EmbedBuilder().setTitle(`${msg.client.user?.username} commands`);

  const adminCmds = msg.client.commands.filter((e) => e.adminOnly);
  const nonAdminCmds = msg.client.commands.filter((e) => !e.adminOnly);

  const requireConfig = nonAdminCmds.filter((e) => e.requireConfig);
  const requireAccount = nonAdminCmds
    .filter((e) => e.requireAccountLinked)
    .filter((e) => !requireConfig.includes(e));
  const normal = nonAdminCmds.filter((e) => !e.requireConfig && !e.requireAccountLinked);

  const format = (cmds: typeof msg.client.commands) =>
    cmds
      .map((cmd) => code(`${commandToEmojis(cmd)}${pref}${cmd.name}`.trim()))
      .join(", ") || "*none*";

  embed.addFields(
    {
      name: "🛡️ Administrator commands",
      value: format(adminCmds),
    },
    {
      name: "🧢 Team commands",
      value: format(requireConfig),
    },
    {
      name: "🔑 User commands",
      value: format(requireAccount),
    },
    {
      name: "⬇️ Start here",
      value: format(normal),
    },
  );

  await msg.reply({ embeds: [embed] });
}

async function helpCommandEmbed(msg: Message, pref: string, commandName: string) {
  const cmd = msg.client.commands.find(
    (e) =>
      e.name ===
      (commandName.startsWith(pref) ? commandName.slice(pref.length) : commandName),
  );

  if (!cmd) {
    throw new CommandUserError("Command not found");
  }
  const embed = new EmbedBuilder().setTitle(`${pref}${cmd.name}`);

  const embedDesc = `
${cmd.description ?? "No description"}

**Aliases**: ${code([...(cmd.aliases ?? []), cmd.name]?.join(", ") ?? "")}
${cmd.requireAccountLinked ? "🔑 Requires login\n" : ""}
${cmd.requireConfig ? "🧢 Requires a set up community\n" : ""}
      `;

  embed.setDescription(embedDesc);
  await msg.reply({ embeds: [embed] });
}

export const helpCommandExecute = async (msg: Message, [commandName]: string[]) => {
  const pref = await msg.client.handlers.command.getPrefix(msg);
  if (commandName) {
    await helpCommandEmbed(msg, pref, commandName);
  } else {
    await helpGeneralEmbed(msg, pref);
  }
};
