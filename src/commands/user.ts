import { getTokenOfUser } from "@/db";
import { Linear } from "@/lib/linear";
import { CommandUserError, type Command } from "@/handlers/command-handler";
import { code } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { linearCache } from "@/lib/linear-cache";

export const user = {
  name: "user",
  description: "Get user",
  requireAccountLinked: true,
  async execute(msg) {
    const idToCheck = msg.mentions[0]?.id ?? msg.author.id;

    const tokenRecord = await getTokenOfUser(idToCheck);

    if (!tokenRecord && msg.mentions[0]?.id) {
      throw new CommandUserError("That user isn't linked to an account.");
    } else if (!tokenRecord) {
      throw new CommandUserError("Not logged in");
    }

    const user = await new Linear(tokenRecord).getViewer();
    linearCache.userTeams.invalidate(user.id);

    const embed = new EmbedBuilder()
      .setDescription(code(user.email))
      .setThumbnail(user.avatarUrl ?? "")
      .setURL(user.url)
      .setTimestamp()
      .setTitle(user.name);

    await msg.reply({ embeds: [embed] });
  },
} satisfies Command;
