import { Message } from "@fluxerjs/core";
import { nanoid } from "nanoid";
import { env } from "../env";
import { type Command } from "../handlers/command-handler";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  addStateLogin,
} from "../login-http";

export const login = {
  name: "login",
  description: "Login to Linear",
  guildOnly: true,
  requireConfig: true,
  async execute(msg: Message, args: Map<string, string>) {
    const user = msg.author;

    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = nanoid(24);

    addStateLogin(state, {
      userId: user.id,
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

    await user.send({
      content: `[Click here to login](${authUrl.toString()})`,
    });

    await msg.reply("check dms!");
  },
} satisfies Command;
