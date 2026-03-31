import { nanoid } from "nanoid";
import { env } from "../env";
import { CommandUserError, type Command } from "../handlers/command-handler";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  addStateLogin,
} from "../login-http";
import { embedOf } from "../utils";
import { db } from "../db";
import { EmbedBuilder } from "../utils/embed-builder";

export const login = {
  name: "login",
  description: "Login to Linear",
  async execute(msg) {
    const userToken = await db.query.userTokens.findFirst({
      where: (tbl, { eq }) => eq(tbl.userId, msg.author.id),
    });
    if (userToken) {
      throw new CommandUserError("You're already logged in!");
    }

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

    await user.send(
      embedOf(
        new EmbedBuilder()
          .setTitle("Click here to login with `linear.app`")
          .setURL(authUrl.toString())
          .setColor(0x00ff00),
      ),
    );

    await msg.reply(
      embedOf(new EmbedBuilder().setDescription("Check your DMs!").setColor(0x00ff00)),
    );
  },
} satisfies Command;
