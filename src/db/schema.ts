import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const guildConfigs = sqliteTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  teamId: text("team_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

export const userTokens = sqliteTable("user_tokens", {
  userId: text("user_id").primaryKey(),
  linearToken: text("linear_token").notNull(),
  linearRefreshToken: text("linear_refresh_token"),
  linearTokenExpiresAt: integer("linear_token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

export const issueIdsMessages = sqliteTable("issue_ids_messages", {
  issueId: text("issue_id"),
  messageId: text("message_id").notNull().primaryKey(),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id"),
    guildId: text("guild_id"),
    permissions: text("permissions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(new Date()),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.guildId] })],
);

export type GuildConfig = typeof guildConfigs.$inferSelect;
export type UserToken = typeof userTokens.$inferSelect;
