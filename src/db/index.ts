import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export const db = drizzle("guilds.db", { schema });

export async function getTokenOfUser(userId: string) {
  const token = await db.query.userTokens.findFirst({
    where: (tbl, { eq }) => eq(tbl.userId, userId),
  });
  return token?.linearToken;
}
