/* modified, grabbed from flux.fm */

import { PermissionFlags, type Client, type Message, type User } from "@fluxerjs/core";
import { FluxerAPIError, HTTPError } from "@fluxerjs/rest";
import { parseArgs } from "string-args-parser";
import { ZodError } from "zod";
import { db } from "../db";
import { guildConfigs, userTokens } from "../db/schema";
import logger from "../lib/logger";
import { EmbedBuilder } from "../utils/embed-builder";
import { Permission, type PermissionSet } from "./permission-handler";
import { code, embedOf, fixCasing } from "../utils";

export interface Command {
  aliases?: string[];
  description?: string;
  execute: (msg: Message, args: string[], config?: GuildConfig) => Promise<void>;
  guildOnly?: boolean;
  hidden?: boolean;
  isAlias?: boolean;
  adminOnly?: boolean;
  name: string;
  requireConfig?: boolean;
  requireAccountLinked?: boolean;
  requirePerms?: Permission[];
}

export type GuildConfig = typeof guildConfigs.$inferSelect;

export type Prefix = string | ((msg: Message) => Promise<string>);

export class CommandHandler {
  private readonly commands = new Map<string, Command>();
  readonly prefix: Prefix;
  readonly client: Client;
  private readonly cachedPrefixes: Map<string, string> = new Map();
  private readonly userCommandsWorking = new Set<string>();

  constructor(prefix: Prefix = "!", client: Client) {
    this.prefix = prefix;
    this.client = client;
  }

  register(cmd: Command): void {
    this.commands.set(cmd.name, cmd);

    for (const alias of cmd.aliases ?? []) {
      this.commands.set(alias, { ...cmd, isAlias: true });
    }
  }

  /* prefix shi */
  private buildPrefix(msg: Message): Promise<string> {
    if (typeof this.prefix === "string") {
      return Promise.resolve(this.prefix);
    }
    return this.prefix(msg);
  }

  invalidateCachedPrefix(guildId: string) {
    this.cachedPrefixes.delete(guildId);
  }

  async getPrefix(msg: Message): Promise<string> {
    const guild = msg.guild;
    if (!guild) {
      return this.buildPrefix(msg);
    }

    const cached = this.cachedPrefixes.get(guild.id);
    if (cached) {
      return cached;
    }

    const prefix = await this.buildPrefix(msg);
    this.cachedPrefixes.set(guild.id, prefix);
    return prefix;
  }

  /* helpers */
  acceptMessage(msg: User): boolean {
    if (msg.bot) {
      return false;
    }

    if (this.userCommandsWorking.has(msg.id)) {
      return false;
    }

    return true;
  }

  public buildErrorEmbed(msg: string) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`❌ ${msg}`)
      .setTimestamp();
  }

  public buildErrorPayload(msg: string) {
    return embedOf(this.buildErrorEmbed(msg));
  }

  async handleError(msg: Message, err: Error) {
    if (
      err instanceof FluxerAPIError &&
      err.code === "MISSING_PERMISSIONS" &&
      msg.guild
    ) {
      await msg.author.send(
        this.buildErrorPayload(
          `I'm missing permissions to chat in ${msg.channel?.name} (${msg.guild.name}) ):`,
        ),
      );
    } else if (err instanceof HTTPError) {
      logger.error("fluxer usual error", err.message);
    } else if (err instanceof CommandUserError) {
      await msg.reply(this.buildErrorPayload(err.message)).catch(logger.error);
    } else {
      logger.error("command error:", err);

      await msg.reply(this.buildErrorPayload(`Internal error...`)).catch(logger.error);
    }
  }

  async handleMessage(msg: Message): Promise<boolean> {
    if (!this.acceptMessage(msg.author)) {
      return false;
    }

    this.userCommandsWorking.add(msg.author.id);

    try {
      const content = msg.content;
      if (content === this.client.user?.toString()) {
        await this.commands.get("help")?.execute(msg, [], undefined);
        return true;
      }

      const prefix = await this.getPrefix(msg);
      if (!content.startsWith(prefix)) {
        return false;
      }

      const rawArgs = parseArgs(content.slice(prefix.length).trim());

      const name = rawArgs.shift()?.toLowerCase();
      if (!name) {
        return false;
      }

      const command = this.commands.get(name);
      if (!command) {
        await msg.reply(this.buildErrorPayload("Unknown command"));
        return false;
      }

      if (command.guildOnly && !msg.guild) {
        await msg.reply(
          this.buildErrorPayload(`This command only works in communities!`),
        );
        return true;
      }

      if (command.adminOnly) {
        const member = msg.guild?.members.get(msg.author.id);
        if (!member?.permissions.has(PermissionFlags.Administrator)) {
          await msg.reply(
            this.buildErrorPayload(`This command requires administrator perms!`),
          );
          return true;
        }
      }

      if (command.requirePerms) {
        const perms = await this.client.handlers.perms.get(msg.author.id, msg.guild!.id);
        const missingPerms = command.requirePerms.filter((p) => !perms[p]);
        if (missingPerms.length > 0) {
          await msg.reply(
            this.buildErrorPayload(
              `You need the following permissions to use this command: ${missingPerms
                .map(fixCasing)
                .map(code)
                .join(", ")}`,
            ),
          );
          return true;
        }
      }

      if (command.requireConfig && msg.guild) {
        const config = await db.query.guildConfigs.findFirst({
          where: (tbl, { eq }) => eq(tbl.guildId, msg.guild!.id),
        });
        if (!config?.teamId) {
          await msg.reply(
            this.buildErrorPayload("Linear isn't configured yet. Use `l!setup` first."),
          );
          return true;
        }
        await command
          .execute(msg, rawArgs, config)
          .catch((err) => this.handleError(msg, err));
        return true;
      }

      if (command.requireAccountLinked) {
        const userToken = await db.query.userTokens.findFirst({
          where: (tbl, { eq }) => eq(tbl.userId, msg.author.id),
        });
        if (!userToken) {
          await msg.reply(
            this.buildErrorPayload("You haven't logged in yet. Use `l!login` first."),
          );
          return true;
        }
      }

      logger.info(
        `${msg.author.username} ran ${prefix}${name} in ${msg.guild?.name ?? "DMs"}`,
      );

      await command.execute(msg, rawArgs).catch((err) => this.handleError(msg, err));

      return true;
    } catch (err) {
      logger.error("command handler error:", err);
      return true;
    } finally {
      this.userCommandsWorking.delete(msg.author.id);
    }
  }
}

export class CommandUserError extends Error {
  /* error that gets shown to the user */
  constructor(message: string) {
    super(message);
    this.name = "CommandUserError";
  }
}
