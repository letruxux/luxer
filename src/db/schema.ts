import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

export type GuildConfig = typeof guildConfigs.$inferSelect;
export type UserToken = typeof userTokens.$inferSelect;
