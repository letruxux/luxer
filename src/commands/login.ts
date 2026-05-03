import { CommandUserError, type Command } from "@/handlers/command-handler";
import { generateAuthUrlForUser } from "@/lib/oauth";
import { bold, embedOf } from "@/utils";
import { getTokenOfUser } from "@/db";
import { EmbedBuilder } from "@/utils/embed-builder";

export const login = {
  name: "login",
  description: "Login to Linear",
  async execute(msg) {
    const userToken = await getTokenOfUser(msg.author.id);
    if (userToken) {
      throw new CommandUserError("You're already logged in!");
    }

    const user = msg.author;

    const authUrl = await generateAuthUrlForUser(user.id);

    await user.send(
      embedOf(
        new EmbedBuilder()
          .setTitle("Click here to login with `linear.app`")
          .setDescription(bold("Make sure to select the correct workspace!"))
          .setImage("https://i.ibb.co/s9bgRyTy/chrome-Hmjrp4-NPXc.png")
          .setURL(authUrl.toString())
          .setColor(0x00ff00),
      ),
    );

    if (msg.guild) {
      await msg.reply(
        embedOf(new EmbedBuilder().setDescription("Check your DMs!").setColor(0x00ff00)),
      );
    }
  },
} satisfies Command;
