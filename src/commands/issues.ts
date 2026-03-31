import { CommandUserError, type Command } from "@/handlers/command-handler";
import { bold, code, quote, textEmbedOf } from "@/utils";
import { issueToEmbed } from "@/utils/linear";
import { Permission } from "@/handlers/permission-handler";
import { PaginationOrderBy } from "@linear/sdk";
import { linearCache } from "@/lib/linear-cache";
import type { Message } from "@fluxerjs/core";
import type { Linear } from "@/lib/linear";
import type { Issue, IssueSearchResult } from "@linear/sdk";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";

const MAX_SHOWN = 3;

async function sendIssue(msg: Message, args: string[], linear: Linear, teamId: string) {
  const query = args.join(" ");
  if (!query) {
    return false;
  }

  const isSearch = !query.includes("-");

  let searchResults: IssueSearchResult[] = [];
  let issue: Issue | undefined;

  if (isSearch) {
    const issues = await linear.client
      .searchIssues(query, { teamId, orderBy: PaginationOrderBy.CreatedAt })
      .then((e) => e.nodes.slice(0, 3));
    searchResults = issues;
  }

  if (searchResults.length === 0) {
    issue = await (
      await linear.client.team(teamId)
    )
      .issues({
        filter: { id: { eq: query } },
      })
      .then((e) => e.nodes[0]);
    if (!issue) {
      return false;
    }
  }

  const mixed = [...searchResults, issue].filter((e) => e) as (
    | Issue
    | IssueSearchResult
  )[];
  if (mixed.length === 0) {
    return false;
  }

  const isOnlyOne = mixed.length === 1;

  const hasCommentPermission = await msg.client.handlers.perms.can(
    msg.author,
    msg.guildId!,
    Permission.READ_COMMENT,
  );

  const comments =
    isOnlyOne && hasCommentPermission
      ? await linear.client
          .comments({
            filter: { issue: { id: { eq: mixed[0]!.id } } },
          })
          .then((e) => e.nodes.reverse())
      : [];

  const content = isSearch
    ? bold(
        `${mixed.length} result${mixed.length === 1 ? "" : "s"} found for ${code(query)}`,
      )
    : "";

  let page = 0;
  let embedsData: Awaited<ReturnType<typeof getPageEmbeds>> = [];

  async function getPageEmbeds() {
    const start = page * MAX_SHOWN;
    const end = start + MAX_SHOWN;
    const pageIssues = mixed.slice(start, end);

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
          comments: isOnlyOne ? comments : [],
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

    for (const embed of embeds) {
      if (isOnlyOne) {
        embed.setFooter({
          text: `Reply to this message to use commands such as ${quote("comment")} and ${quote("label")}`,
        });
      } else {
        const prefix = await msg.client.handlers.command.getPrefix(msg);
        embed.setFooter({
          text: `Send ${quote(`${prefix}issue ${(issue as Issue | IssueSearchResult).identifier}`)} to view comments, labels and use commands`,
        });
      }
    }

    return embeds;
  }

  embedsData = await getPageEmbeds();

  const contentText = isOnlyOne
    ? content
    : bold(
        `${mixed.length} result${mixed.length === 1 ? "" : "s"} found for ${code(query)} - Page ${page + 1}/${Math.ceil(mixed.length / MAX_SHOWN)}`,
      );

  const sentMessage = await msg.reply({
    embeds: embedsData,
    content: contentText,
  });

  if (isOnlyOne) {
    await db
      .insert(issueIdsMessages)
      .values({ issueId: mixed[0]!.id, messageId: sentMessage.id });
  }

  if (mixed.length <= MAX_SHOWN) {
    return true;
  }

  async function handleReactions() {
    const reactionResult = await msg.client.handlers.reaction.wait(sentMessage, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: ["⬅️", "➡️"],
      timeout: 120_000,
    });

    if (!reactionResult) return true;

    const emoji = reactionResult.emoji;

    if (emoji.name === "➡️" && (page + 1) * MAX_SHOWN < mixed.length) {
      page++;
    } else if (emoji.name === "⬅️" && page > 0) {
      page--;
    } else {
      return handleReactions();
    }

    const newEmbeds = await getPageEmbeds();
    await sentMessage.removeReaction(emoji.name, msg.author.id);
    const newContent = bold(
      `${mixed.length} results found for ${code(query)} - Page ${page + 1}/${Math.ceil(mixed.length / MAX_SHOWN)}`,
    );
    await sentMessage.edit({ embeds: newEmbeds, content: newContent });

    return handleReactions();
  }

  await handleReactions();

  return true;
}

export const issues = {
  name: "issues",
  description: "Find or list issues",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  aliases: ["i", "issue"],
  requirePerms: [Permission.READ_ISSUE],

  async execute(msg, _rawArgs, extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config?.teamId!;
    if (!linear || !teamId)
      throw new CommandUserError("Not logged in or team not configured.");

    const query = _rawArgs.join(" ");

    if (query) {
      const success = await sendIssue(msg, _rawArgs, linear, teamId);
      if (success) return;
    }

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
      await msg.reply(textEmbedOf("No issues found."));
      return;
    }

    let page = 0;
    async function getPageEmbeds() {
      const start = page * MAX_SHOWN;
      const end = start + MAX_SHOWN;
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

    const content = bold(
      `${searchResults.nodes.length} result${searchResults.nodes.length === 1 ? "" : "s"} found` +
        (query.length ? ` for ${code(query)}` : "") +
        ` - Page ${page + 1}/${Math.ceil(searchResults.nodes.length / MAX_SHOWN)}`,
    );

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

      if (emoji.name === "➡️" && (page + 1) * MAX_SHOWN < searchResults.nodes.length) {
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
