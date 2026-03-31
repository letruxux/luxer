import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { rolePermissions } from "../db/schema";
import type { Role, User } from "@fluxerjs/core";
import { code, fixCasing } from "../utils";

export enum Permission {
  READ_ISSUE = "read_issue",
  CREATE_ISSUE = "create_issue",
  COMMENT_ISSUE = "comment_issue",
  READ_COMMENT = "read_comment",
  DELETE_ISSUE = "delete_issue",
  UPDATE_ISSUE = "update_issue",

  CREATE_LABEL = "create_label",
  DELETE_LABEL = "delete_label",
  UPDATE_LABEL = "update_label",

  UPDATE_STATE = "update_state",
}

export type PermissionSet = Record<Permission, boolean>;

export function permissionSetToString(perms: PermissionSet) {
  return Object.entries(perms)
    .map(([k, v], i) => `${code((i + 1).toString())} ${fixCasing(k)}: ${v ? "✅" : "❌"}`)
    .join("\n");
}

export class PermissionHandler {
  parsePermissionRow(row: string | undefined): PermissionSet {
    const allPermissions = Object.values(Permission) as Permission[];

    const acc: PermissionSet = allPermissions.reduce((obj, perm) => {
      obj[perm] = false;
      return obj;
    }, {} as PermissionSet);

    (row ?? "")
      .split(",")
      .map((p) => p.trim())
      .forEach((p) => {
        if (p in acc) acc[p as Permission] = true;
      });

    return acc;
  }

  async getRole(roleId: string, guildId: string): Promise<PermissionSet> {
    const row = await db
      .select()
      .from(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.guildId, guildId)),
      )
      .limit(1)
      .execute()
      .then((e) => e[0]);

    return this.parsePermissionRow(row?.permissions);
  }

  async get(user: User, guildId: string): Promise<PermissionSet> {
    const guild =
      user.client.guilds.get(guildId) ?? (await user.client.guilds.fetch(guildId));
    if (!guild) return this.parsePermissionRow("");

    const member = await guild.fetchMember(user.id);
    const roles = member.roles.roleIds;

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(
        and(inArray(rolePermissions.roleId, roles), eq(rolePermissions.guildId, guildId)),
      )
      .execute();

    const allPerms = rows.map((r) => this.parsePermissionRow(r.permissions));
    const merged = allPerms.reduce((acc, perms) => {
      for (const [perm, value] of Object.entries(perms) as [Permission, boolean][]) {
        acc[perm] = acc[perm] || value;
      }
      return acc;
    }, {} as PermissionSet);

    return merged;
  }

  async update(role: Role, permissions: Partial<PermissionSet>) {
    const row = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, role.id),
          eq(rolePermissions.guildId, role.guildId),
        ),
      )
      .limit(1)
      .execute()
      .then((e) => e[0]);

    const newPermissions = this.parsePermissionRow(row ? row.permissions : "");

    for (const [perm, value] of Object.entries(permissions) as [Permission, boolean][]) {
      newPermissions[perm] = value;
    }

    const newPermissionsRaw = Object.entries(newPermissions)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(",");

    await db
      .insert(rolePermissions)
      .values({
        roleId: role.id,
        guildId: role.guildId,
        permissions: newPermissionsRaw,
      })
      .onConflictDoUpdate({
        target: [rolePermissions.roleId, rolePermissions.guildId],
        set: {
          permissions: newPermissionsRaw,
        },
      });
  }

  async can(user: User, guildId: string, permission: Permission) {
    return this.get(user, guildId).then((perms) => perms[permission]);
  }
}
