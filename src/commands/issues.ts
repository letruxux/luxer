import { CommandUserError, type Command } from "@/handlers/command-handler";
import { bold, code, quote, textEmbedOf } from "@/utils";
import { issueToEmbed } from "@/utils/linear";
import { Permission } from "@/handlers/permission-handler";
import { PaginationOrderBy } from "@linear/sdk";
import { linearCache } from "@/lib/linear-cache";
import type { Message } from "@fluxerjs/core";
import type { Linear } from "@/lib/linear";
import type { Issue, IssueSearchResult, Comment } from "@linear/sdk";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";

const MAX_SHOWN = 3;

interface EnrichedIssue {
  labels: string[];
  state: string;
  creatorName?: string;
  creatorPicture?: string | null;
}

async function getMoreIssueMetadata(
  issue: Issue | IssueSearchResult,
  linear: Linear,
  { isSearchResult = false } = {},
): Promise<EnrichedIssue> {
  const issueFull = isSearchResult
    ? await linearCache.getOrSetIssue(issue.id, linear.client.issue(issue.id))
    : await linear.client.issue(issue.id);

  const [labels, state, creator] = await Promise.all([
    linearCache
      .getOrSetLabels(issue.id, issueFull.labels())
      .then((e) => e.nodes.map((l) => l.name)),
    issue.state
      ? linearCache.getOrSetState(issue.id, issue.state).then((e) => e.name)
      : "(no state)",
    issueFull.creator ? linearCache.getOrSetUser(issue.id, issueFull.creator) : undefined,
  ]);

  return {
    labels,
    state,
    creatorName: creator?.name,
    creatorPicture: creator?.avatarUrl,
  };
}

async function buildIssueEmbed(
  issue: Issue,
  linear: Linear,
  comments: Comment[],
  msg: Message,
) {
  const enriched = await getMoreIssueMetadata(issue, linear);
  const prefix = await msg.client.handlers.command.getPrefix(msg);

  const embed = await issueToEmbed({
    createdAt: issue.createdAt,
    dueDate: issue.dueDate,
    description: issue.description ?? "(no description)",
    comments,
    identifier: issue.identifier,
    labels: enriched.labels,
    state: enriched.state,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
    creatorName: enriched.creatorName,
    creatorPicture: enriched.creatorPicture ?? undefined,
  });

  const cmd = (name: string) => quote(`${prefix}${name}`);
  embed.setFooter({
    text: `Reply with ${cmd("comment")}, ${cmd("label")}, ${cmd("due")} or ${cmd("state")}.`,
  });

  return embed;
}

async function buildSearchResultEmbed(
  issue: IssueSearchResult,
  linear: Linear,
  msg: Message,
) {
  const enriched = await getMoreIssueMetadata(issue, linear);

  const embed = await issueToEmbed({
    createdAt: issue.createdAt,
    dueDate: issue.dueDate,
    description: issue.description ?? "(no description)",
    comments: [],
    identifier: issue.identifier,
    labels: enriched.labels,
    state: enriched.state,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
    creatorName: enriched.creatorName,
    creatorPicture: enriched.creatorPicture ?? undefined,
  });

  const prefix = await msg.client.handlers.command.getPrefix(msg);
  embed.setFooter({
    text: `Send ${quote(`${prefix}issue ${issue.identifier}`)} to view comments, labels and use commands`,
  });

  return embed;
}

async function getPageEmbeds({
  issues,
  linear,
  comments,
  msg,
  page,
  isSearchResult,
}: {
  issues: (Issue | IssueSearchResult)[];
  linear: Linear;
  comments: Comment[];
  msg: Message;
  page: number;
  isSearchResult: boolean;
}) {
  const start = page * MAX_SHOWN;
  const end = start + MAX_SHOWN;
  const pageIssues = issues.slice(start, end);

  return Promise.all(
    pageIssues.map((issue) => {
      const isSingleIssue = pageIssues.length === 1 && !isSearchResult;
      if (isSingleIssue && issue instanceof Object && "id" in issue) {
        return buildIssueEmbed(issue as Issue, linear, comments, msg);
      }
      return buildSearchResultEmbed(issue as IssueSearchResult, linear, msg);
    }),
  );
}

interface DoThePagesParams {
  msg: Message;
  sentMessage: Message;
  issues: (Issue | IssueSearchResult)[];
  linear: Linear;
  comments: Comment[];
  isSearchResult: boolean;
  page: number;
  getContent: (page: number) => string;
}

async function doThePages({
  msg,
  sentMessage,
  issues,
  linear,
  comments,
  isSearchResult,
  page,
  getContent,
}: DoThePagesParams) {
  async function next() {
    const reactionResult = await msg.client.handlers.reaction.wait(sentMessage, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: ["⬅️", "➡️"],
      timeout: 120_000,
    });

    if (!reactionResult) return;

    const emoji = reactionResult.emoji;

    if (emoji.name === "➡️" && (page + 1) * MAX_SHOWN < issues.length) {
      page++;
    } else if (emoji.name === "⬅️" && page > 0) {
      page--;
    } else {
      return next();
    }

    const newEmbeds = await getPageEmbeds({
      issues,
      linear,
      comments,
      isSearchResult,
      msg,
      page,
    });
    await sentMessage.removeReaction(emoji.name, msg.author.id);
    await sentMessage.edit({ embeds: newEmbeds, content: getContent(page) });

    return next();
  }

  await next();
}

async function searchIssues(query: string, linear: Linear, teamId: string) {
  const isSearch = !query.includes("-");

  if (isSearch) {
    const results = await linear.client
      .searchIssues(query, { teamId, orderBy: PaginationOrderBy.CreatedAt })
      .then((e) => e.nodes.slice(0, 3));
    return results;
  }

  const issue = await (
    await linear.client.team(teamId)
  )
    .issues({
      filter: { id: { eq: query } },
    })
    .then((e) => e.nodes[0]);

  return issue ? [issue] : [];
}

async function viewIssue(issue: Issue, linear: Linear, msg: Message) {
  const hasCommentPermission = await msg.client.handlers.perms.can(
    msg.author,
    msg.guildId!,
    Permission.READ_COMMENT,
  );

  const comments: Comment[] = hasCommentPermission
    ? await linear.client
        .comments({
          filter: { issue: { id: { eq: issue.id } } },
        })
        .then((e) => e.nodes.reverse())
    : [];

  const embeds = await getPageEmbeds({
    issues: [issue],
    linear,
    comments,
    isSearchResult: false,
    msg,
    page: 0,
  });

  const content = bold(`${1} result found for ${code(issue.identifier)}`);

  const sentMessage = await msg.reply({
    embeds,
    content,
  });

  await db
    .insert(issueIdsMessages)
    .values({ issueId: issue.id, messageId: sentMessage.id });

  return sentMessage;
}

async function viewOrSearchIssues(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
) {
  const query = args.join(" ");
  if (!query) {
    return false;
  }

  const results = await searchIssues(query, linear, teamId);
  if (results.length === 0) {
    return false;
  }

  const isOnlyOne = results.length === 1;

  if (isOnlyOne) {
    const issue = results[0] as Issue;
    await viewIssue(issue, linear, msg);
    return true;
  }

  const embedsData = await getPageEmbeds({
    issues: results,
    linear,
    comments: [],
    isSearchResult: true,
    msg,
    page: 0,
  });

  const contentText = bold(
    `${results.length} results found for ${code(query)} - Page 1/${Math.ceil(results.length / MAX_SHOWN)}`,
  );

  const sentMessage = await msg.reply({
    embeds: embedsData,
    content: contentText,
  });

  if (results.length <= MAX_SHOWN) {
    return true;
  }

  await doThePages({
    msg,
    sentMessage,
    issues: results,
    linear,
    comments: [],
    isSearchResult: true,
    page: 0,
    getContent: (p: number) =>
      bold(
        `${results.length} results found for ${code(query)} - Page ${p + 1}/${Math.ceil(results.length / MAX_SHOWN)}`,
      ),
  });

  return true;
}

async function viewAllIssues(msg: Message, linear: Linear, teamId: string) {
  const results = await linear.client.issues({
    filter: { team: { id: { eq: teamId } } },
    orderBy: PaginationOrderBy.CreatedAt,
  });

  if (!results.nodes.length) {
    await msg.reply(textEmbedOf("No issues found."));
    return;
  }

  const issues = results.nodes as Issue[];

  const content = bold(
    `${issues.length} result${issues.length === 1 ? "" : "s"} found - Page 1/${Math.ceil(issues.length / MAX_SHOWN)}`,
  );

  const embeds = await getPageEmbeds({
    issues,
    linear,
    comments: [],
    isSearchResult: true,
    msg,
    page: 0,
  });
  const sentMessage = await msg.reply({ embeds, content });

  if (issues.length <= MAX_SHOWN) {
    return;
  }

  await doThePages({
    msg,
    sentMessage,
    issues,
    linear,
    comments: [],
    isSearchResult: true,
    page: 0,
    getContent: (p: number) =>
      bold(
        `${issues.length} result${issues.length === 1 ? "" : "s"} found - Page ${p + 1}/${Math.ceil(issues.length / MAX_SHOWN)}`,
      ),
  });
}
export const issues = {
  name: "issues",
  description: "Find or list issues (can be used for search, view and view all)",
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
      const success = await viewOrSearchIssues(msg, _rawArgs, linear, teamId);
      if (success) return;
    }

    await viewAllIssues(msg, linear, teamId);
  },
} satisfies Command;
