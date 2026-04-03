import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  server: {
    DATABASE_FILENAME: z.string().min(1).default("linear.sqlite"),
    FLUXER_TOKEN: z.string().min(1),
    PORT: z.coerce.number().default(8288),
    LINEAR_CLIENT_ID: z.string().min(1),
    LINEAR_CLIENT_SECRET: z.string().min(1),
    LINEAR_REDIRECT_URI: z.url(),
    LINEAR_WEBHOOK_SECRET: z.string().optional(),
  },

  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
