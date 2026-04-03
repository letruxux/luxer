import { Hono } from "hono";
import authRoutes from "./lib/oauth";
import webhookRoutes from "./lib/webhook/routes";

export default function makeHTTP() {
  const http = new Hono();

  http.route("/callback", authRoutes);
  http.route("/webhook", webhookRoutes);

  return http;
}
