import { CommandUserError, type Command } from "@/handlers/command-handler";
import { bold, code } from "@/utils";
import { issueToEmbed } from "@/utils/linear";
import { Permission } from "@/handlers/permission-handler";
import { PaginationOrderBy } from "@linear/sdk";
import { linearCache } from "@/lib/linear-cache";

export const issues = {
  name: "issues",
  description: "List all issues",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  aliases: ["i"],
  requirePerms: [Permission.READ_ISSUE],

  async execute(msg, _rawArgs, extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config?.teamId!;
    if (!linear || !teamId)
      throw new CommandUserError("Not logged in or team not configured.");

    const query = _rawArgs.join(" ");

    const searchResults = query.length
      ? await linear.client.searchIssues(query, {
          teamId,
          orderBy: PaginationOrderBy.CreatedAt,
        })
      : await linear.client.issues({
          filter: { team: { id: { eq: teamId } } },
          orderBy: PaginationOrderBy.CreatedAt,
        });

    if (!searchResults.nodes.length) {
      await msg.reply("No issues found.");
      return;
    }

    const maxShown = 3;
    let page = 0;
    let content = "";
    async function getPageEmbeds() {
      content = bold(
        `${searchResults.nodes.length} result${searchResults.nodes.length === 1 ? "" : "s"} found` +
          (query.length ? ` for ${code(query)}` : "") +
          ` - Page ${page + 1}/${Math.ceil(searchResults.nodes.length / maxShown)}`,
      );

      const start = page * maxShown;
      const end = start + maxShown;
      const pageIssues = searchResults.nodes.slice(start, end);

      const embeds = await Promise.all(
        pageIssues.map(async (issue) => {
          const issueFull = await linear.client.issue(issue.id);
          const labels = await linearCache
            .getOrSetLabels(issue.id, issueFull.labels())
            .then((e) => e.nodes.map((l) => l.name));

          const state = issue.state
            ? await linearCache.getOrSetState(issue.id, issue.state).then((e) => e.name)
            : "(no state)";

          const creator = issueFull.creator
            ? await linearCache.getOrSetUser(issue.id, issueFull.creator)
            : undefined;

          return issueToEmbed({
            createdAt: issue.createdAt,
            dueDate: issue.dueDate,
            description: issue.description ?? "(no description)",
            comments: [],
            identifier: issue.identifier,
            labels,
            state,
            title: issue.title,
            url: issue.url,
            updatedAt: issue.updatedAt,
            creatorName: creator?.name,
            creatorPicture: creator?.avatarUrl ?? undefined,
          });
        }),
      );

      return embeds;
    }

    const embeds = await getPageEmbeds();
    const sentMessage = await msg.reply({ embeds, content });

    async function handleReactions() {
      const reactionResult = await msg.client.handlers.reaction.wait(sentMessage, {
        allowedUserIds: [msg.author.id],
        allowedEmojis: ["⬅️", "➡️"],
        timeout: 120_000,
      });

      if (!reactionResult) return;

      const emoji = reactionResult.emoji;

      if (emoji.name === "➡️" && (page + 1) * maxShown < searchResults.nodes.length) {
        page++;
      } else if (emoji.name === "⬅️" && page > 0) {
        page--;
      } else {
        return;
      }

      const newEmbeds = await getPageEmbeds();
      await sentMessage.removeReaction(emoji.name, msg.author.id);
      await sentMessage.edit({ embeds: newEmbeds, content });

      return handleReactions();
    }

    await handleReactions();
  },
} satisfies Command;
