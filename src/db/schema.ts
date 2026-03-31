import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const guildConfigs = sqliteTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  linearToken: text("linear_token").notNull(),
  teamId: text("team_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

export type GuildConfig = typeof guildConfigs.$inferSelect;
