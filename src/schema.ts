import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const guildConfigs = sqliteTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  linearToken: text("linear_token").notNull(),
  teamId: text("team_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

export const pendingSetups = sqliteTable("pending_setups", {
  guildId: text("guild_id").primaryKey(),
  linearToken: text("linear_token").notNull(),
  step: text("step"),
  teams: text("teams"),
  teamsMessageId: text("teams_message_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

export type GuildConfig = typeof guildConfigs.$inferSelect;
export type NewGuildConfig = typeof guildConfigs.$inferInsert;
export type PendingSetup = typeof pendingSetups.$inferSelect;
export type NewPendingSetup = typeof pendingSetups.$inferInsert;
