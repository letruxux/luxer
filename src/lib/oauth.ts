import { db } from "@/db";
import { userTokens } from "@/db/schema";
import { bold } from "@/utils";
import { EmbedBuilder } from "@fluxerjs/core";
import { REST, Routes } from "@fluxerjs/rest";
import { Hono } from "hono";
import type { OAuthTokens } from "./linear";
import logger from "./logger";
import { env } from "@/env";
import { nanoid } from "nanoid";

const authRoutes = new Hono();
const fluxerRest = new REST();
fluxerRest.setToken(env.FLUXER_TOKEN);

const oauthStates = new Map<string, { userId: string; codeVerifier: string }>();

export async function generateAuthUrlForUser(userId: string) {
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = nanoid(24);

  addStateLogin(state, {
    userId: userId,
    codeVerifier,
  });

  const authUrl = new URL("https://linear.app/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.LINEAR_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", env.LINEAR_REDIRECT_URI!);
  authUrl.searchParams.set("scope", "read,write");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return authUrl;
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(hash);
}

function addStateLogin(state: string, data: { userId: string; codeVerifier: string }) {
  oauthStates.set(state, data);
}

authRoutes.get("/", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.text("access denied");
  }

  if (!code || !state) {
    return c.text("invalid request");
  }

  const oauthData = oauthStates.get(state);
  if (!oauthData) {
    return c.text("invalid state");
  }

  oauthStates.delete(state);

  const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.LINEAR_REDIRECT_URI!,
      client_id: env.LINEAR_CLIENT_ID!,
      client_secret: env.LINEAR_CLIENT_SECRET!,
      code_verifier: oauthData.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    console.error("token exc fail:", await tokenResponse.text());
    return c.text("token exchange fail");
  }

  const tokens = (await tokenResponse.json()) as OAuthTokens;

  await db
    .insert(userTokens)
    .values({
      userId: oauthData.userId,
      linearToken: tokens.access_token,
      linearRefreshToken: tokens.refresh_token,
      linearTokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in ?? 0) * 1000)
        : null,
    })
    .onConflictDoUpdate({
      target: userTokens.userId,
      set: {
        linearToken: tokens.access_token,
        linearRefreshToken: tokens.refresh_token ?? null,
        linearTokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + (tokens.expires_in ?? 0) * 1000)
          : null,
      },
    });

  try {
    const dmResponse = (await fluxerRest.post(Routes.userMeChannels(), {
      body: { recipient_id: oauthData.userId },
    })) as any;

    const dmChannelId = dmResponse.id;

    await fluxerRest.post(Routes.channelMessages(dmChannelId), {
      body: {
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setDescription(bold("Successfully linked your Linear account!")),
        ],
      },
    });
  } catch (error) {
    logger.error("DM send failed:", error);
  }

  return c.text("success! go back to fluxer");
});

export default authRoutes;
