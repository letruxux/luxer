import { CommandUserError, type Command } from "../handlers/command-handler";
import { bold, code, quote } from "../utils";
import { issueToEmbed } from "../utils/linear";
import { Permission } from "../handlers/permission-handler";
import type { Message } from "@fluxerjs/core";
import type { Linear } from "../lib/linear";
import { PaginationOrderBy, type Issue, type IssueSearchResult } from "@linear/sdk";
import type { EmbedBuilder } from "../utils/embed-builder";
import { db } from "../db";
import { issueIdsMessages } from "../db/schema";

async function sendExistingIssue(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
) {
  const identifier = args.join(" ");
  if (!identifier) {
    return false;
  }

  const isSearch = !identifier.includes("-");

  let content = "";
  let searchResults: IssueSearchResult[] = [];
  let issue: Issue | undefined;
  if (isSearch) {
    const d = await Promise.all(
      await linear.client
        .searchIssues(identifier, { teamId, orderBy: PaginationOrderBy.CreatedAt })
        .then((e) => e.nodes.slice(0, 3)),
    );
    content = `Showing ${d.length} result${d.length === 1 ? "" : "s"} for ${bold(code(identifier))}`;
    searchResults = d;
  }

  if (searchResults.length === 0) {
    issue = await (
      await linear.client.team(teamId)
    )
      .issues({
        filter: { id: { eq: identifier } },
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

  const comments = (await msg.client.handlers.perms.can(
    msg.author,
    msg.guildId!,
    Permission.READ_COMMENT,
  ))
    ? isOnlyOne
      ? await linear.client
          .comments({
            filter: { issue: { id: { eq: mixed[0]!.id } } },
          })
          .then((e) => e.nodes.reverse())
      : []
    : [];

  const embeds: EmbedBuilder[] = [];

  for (const issue of mixed) {
    const creator = issue.creator ? await issue.creator : undefined;

    const embed = await issueToEmbed({
      createdAt: issue.createdAt,
      dueDate: issue.dueDate,
      description: issue.description ?? "(no description)",
      comments,
      identifier: issue.identifier,
      labels: Object.hasOwn(issue, "labels")
        ? (await (issue as Issue).labels()).nodes.map((l) => l.name)
        : (await (await linear.client.issue(issue.id)).labels()).nodes.map((l) => l.name),
      state: issue.state ? (await issue.state)?.name : "(no state)",
      title: issue.title,
      url: issue.url,
      updatedAt: issue.updatedAt,
      creatorName: creator?.name,
      creatorPicture: creator?.avatarUrl ?? undefined,
    });

    if (isOnlyOne) {
      embed.setFooter({
        text: `Reply to this message to use commands such as ${quote("comment")} and ${quote("label")}`,
      });
    } else {
      const prefix = await msg.client.handlers.command.getPrefix(msg);
      embed.setFooter({
        text: `Send ${quote(`${prefix}issue ${issue.identifier}`)} to view comments, labels and use commands`,
      });
    }

    embeds.push(embed);
  }

  const sentMsg = await msg.reply({ embeds, content });
  if (isOnlyOne) {
    await db
      .insert(issueIdsMessages)
      .values({ issueId: mixed[0]!.id, messageId: sentMsg.id });
  }

  return true;
}

export const issue = {
  name: "issue",
  description: "Find issue",
  requireAccountLinked: true,
  requireConfig: true,
  guildOnly: true,
  aliases: ["i"],
  requirePerms: [Permission.READ_ISSUE],
  async execute(msg, _rawArgs, extra) {
    const linear = extra?.userLinear;
    const teamId = extra?.config?.teamId;
    if (!linear || !teamId)
      throw new CommandUserError("Not logged in or team not configured.");

    const success = await sendExistingIssue(msg, _rawArgs, linear, teamId);
    if (!success) {
      throw new CommandUserError("Issue not found");
    }
  },
} satisfies Command;
