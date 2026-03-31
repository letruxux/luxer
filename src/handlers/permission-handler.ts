import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userPermissions } from "../db/schema";

export enum Permission {
  READ_ISSUE = "read_issue",
  CREATE_ISSUE = "create_issue",
  COMMENT_ISSUE = "comment_issue",
  DELETE_ISSUE = "delete_issue",

  CREATE_LABEL = "create_label",
  DELETE_LABEL = "delete_label",
  UPDATE_LABEL = "update_label",

  UPDATE_STATE = "update_state",
}

export type PermissionSet = Record<Permission, boolean>;

export class PermissionHandler {
  private parsePermissionRow(row: string | undefined): PermissionSet {
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

  async get(userId: string, guildId: string): Promise<PermissionSet> {
    const row = await db
      .select()
      .from(userPermissions)
      .where(
        and(eq(userPermissions.userId, userId), eq(userPermissions.guildId, guildId)),
      )
      .limit(1)
      .execute()
      .then((e) => e[0]);

    return this.parsePermissionRow(row?.permissions);
  }

  async update(userId: string, guildId: string, permissions: Partial<PermissionSet>) {
    const row = await db
      .select()
      .from(userPermissions)
      .where(
        and(eq(userPermissions.userId, userId), eq(userPermissions.guildId, guildId)),
      )
      .limit(1)
      .execute()
      .then((e) => e[0]);

    const newPermissions = this.parsePermissionRow(row ? row.permissions : "");

    for (const [perm, value] of Object.entries(permissions) as [Permission, boolean][]) {
      newPermissions[perm] = value;
    }

    await db
      .update(userPermissions)
      .set({
        permissions: Object.entries(newPermissions)
          .filter(([_, v]) => v)
          .map(([k]) => k)
          .join(","),
      })
      .where(
        and(eq(userPermissions.userId, userId), eq(userPermissions.guildId, guildId)),
      )
      .execute();
  }
}
