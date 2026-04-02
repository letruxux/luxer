import { Hono } from "hono";
import { createDiscordMessage } from "./message";
import logger from "../logger";

const webhookRoutes = new Hono();

webhookRoutes.post("/", async (c) => {
  try {
    const linearData = await c.req.json();
    logger.dim("Received webhook from Linear:", JSON.stringify(linearData, null, 2));

    const discordMessage = createDiscordMessage(linearData);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.error("DISCORD_WEBHOOK_URL not set");
      return c.json({ error: "Discord webhook URL not configured" }, 500);
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Discord webhook failed:", errorText);
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    return c.json({ status: "success" });
  } catch (error) {
    logger.error("Error processing webhook:", error);
    return c.json({ error: "Failed to process webhook" }, 500);
  }
});

export default webhookRoutes;
