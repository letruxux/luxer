import { Hono } from "hono";
import authRoutes from "./lib/oauth";
import makeWebhookRoutes from "./lib/webhook/routes";

export default function makeHTTP() {
  const webhookRoutes = makeWebhookRoutes();
  const http = new Hono();

  http.route("/callback", authRoutes);
  if (webhookRoutes) http.route("/webhook", webhookRoutes);

  return http;
}
