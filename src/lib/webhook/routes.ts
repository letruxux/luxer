import { Hono } from "hono";
import {
  LinearWebhookClient,
  LINEAR_WEBHOOK_SIGNATURE_HEADER,
  LINEAR_WEBHOOK_TS_FIELD,
  type EntityWebhookPayloadWithEntityData,
} from "@linear/sdk/webhooks";
import { createDiscordMessage } from "./message";
import { hexToTerminal, Logger } from "../logger";
import { env } from "@/env";

const logger = new Logger(
  `${hexToTerminal("#2ff")}[webhooks]${Logger.resetColor}`,
  "#fff",
);

function makeWebhookRoutes() {
  if (!env.LINEAR_WEBHOOK_SECRET) {
    logger.info("LINEAR_WEBHOOK_SECRET not set, disabling webhooks");
    return null;
  }

  const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

  const webhookRoutes = new Hono();

  webhookRoutes.post("/", async (c) => {
    try {
      const signature = c.req.header(LINEAR_WEBHOOK_SIGNATURE_HEADER);
      const rawBody = await c.req.text();
      const body = JSON.parse(rawBody);
      const timestamp = body[LINEAR_WEBHOOK_TS_FIELD];

      if (!webhookClient.verify(rawBody as any, signature ?? "", timestamp)) {
        logger.error("Invalid webhook signature");
        return c.json({ error: "Invalid signature" }, 401);
      }

      logger.dim(`Received ${body.type} event:`, JSON.stringify(body, null, 2));

      const discordMessage = createDiscordMessage(body as EntityWebhookPayloadWithEntityData);

      await sendToDiscord(discordMessage);

      return c.json({ status: "success" });
    } catch (error) {
      logger.error("Error processing webhook:", error);
      return c.json({ error: "Failed to process webhook" }, 500);
    }
  });

  async function sendToDiscord(message: ReturnType<typeof createDiscordMessage>) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.error("DISCORD_WEBHOOK_URL not set");
      return;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Discord webhook failed:", errorText);
    }
  }

  return webhookRoutes;
}

export default makeWebhookRoutes;
