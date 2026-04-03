import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { env } from "@/env";

export const db = drizzle(env.DATABASE_FILENAME, { schema });

export async function getTokenOfUser(userId: string) {
  const token = await db.query.userTokens.findFirst({
    where: (tbl, { eq }) => eq(tbl.userId, userId),
  });
  return token?.linearToken;
}
