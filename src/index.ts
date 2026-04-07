import { serve } from "bun";
import { env } from "./env";
import logger from "./lib/logger";
import { db } from "./db";
import makeHTTP from "./http";
import makeBotClient from "./bot";

const http = makeHTTP();
const client = makeBotClient();

client.once("ready", async () => {
  logger.info(`${client.user?.username}#${client.user?.discriminator} is ready!`);
});

client.on("messageCreate", client.handlers.command.handleMessage);

client.login(env.FLUXER_TOKEN!);

const server = serve({
  fetch: http.fetch,
  port: env.PORT,
});

async function shutdown() {
  logger.info("Shutting down...");
  await server.stop();

  db.$client.close();

  await client.destroy();

  logger.info("Bye!");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
