import { db } from "../db";
import { rolePermissions } from "../db/schema";
import { type Command } from "../handlers/command-handler";
import { eq } from "drizzle-orm";
import { countOccurrences, embedOf, isAll, textEmbedOf } from "../utils";
import { EmbedBuilder } from "../utils/embed-builder";
import type { Role } from "@fluxerjs/core";
import { Permission, permissionSetToString } from "../handlers/permission-handler";
import { NUMBER_EMOJIS } from "../handlers/reaction-handler";

export const role = {
  name: "role",
  description: "Configure roles",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  aliases: ["roles"],
  async execute(msg) {
    const guild = msg.guild!;

    const roleIds = msg.mentionRoles;
    if (!roleIds.length) {
      const currentSetups = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.guildId, guild.id))
        .execute();

      if (currentSetups.length === 0) {
        const prefix = await msg.client.handlers.command.getPrefix(msg);
        await msg.reply(
          textEmbedOf(
            `Use \`${prefix}role <role mention>\` to set up a role's permissions.`,
            {
              title: "No configured roles found",
            },
          ),
        );
        return;
      }

      const allRoles = Array.from(guild.roles.values())
        .reverse()
        .sort((a, b) => b.position - a.position)
        .slice(0, guild.roles.size - 1);

      const desc = allRoles
        .map((role) => {
          const row = currentSetups.find((d) => d.roleId === role.id);

          if (!row) {
            return `${role}: ⬛`;
          }

          const permissionSet = msg.client.handlers.perms.parsePermissionRow(
            row.permissions,
          );

          return `${role}: ${
            isAll(permissionSet, true) ? "🟩" : isAll(permissionSet, false) ? "🟥" : "🟧"
          } ${countOccurrences(Object.values(permissionSet), true)}/${
            Object.values(permissionSet).length
          }`;
        })
        .join("\n");

      await msg.reply(
        embedOf(new EmbedBuilder().setDescription(desc).setTitle("Configured roles")),
      );
    } else {
      const firstRoleId = roleIds[0]!;
      const firstRole = guild.roles.get(firstRoleId)!;
      const permissionSet = await msg.client.handlers.perms.getRole(
        firstRole.id,
        guild.id,
      );

      const msgResp = await msg.reply(
        textEmbedOf(permissionSetToString(permissionSet), {
          title: `**Role ${firstRole.name}** permissions`,
        }),
      );

      async function handleReactions() {
        const resp = await msg.client.handlers.reaction.wait(msgResp, {
          allowedUserIds: [msg.author.id],
          allowedEmojis: NUMBER_EMOJIS,
          timeout: 120_000,
        });

        if (!resp) {
          await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
          await msgResp.removeAllReactions();
          return;
        }

        await msgResp.removeReaction(resp.emoji.name, msg.author.id);

        const numberValue = NUMBER_EMOJIS.indexOf(resp.emoji.name) + 1;

        const permissionAtIndex = Object.keys(permissionSet)[
          numberValue - 1
        ]! as Permission;

        permissionSet[permissionAtIndex] = !permissionSet[permissionAtIndex];

        await msg.client.handlers.perms.update(firstRole, permissionSet);

        await msgResp.edit(
          textEmbedOf(permissionSetToString(permissionSet), {
            title: `**Role ${firstRole.name}** permissions`,
          }),
        );

        return handleReactions();
      }

      await handleReactions();
    }
  },
} satisfies Command;
