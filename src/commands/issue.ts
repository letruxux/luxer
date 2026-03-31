import { CommandUserError, type Command } from "../handlers/command-handler";
import { bold, code } from "../utils";
import { issueToEmbed } from "../utils/linear";
import { Permission } from "../handlers/permission-handler";
import type { Message } from "@fluxerjs/core";
import type { Linear } from "../lib/linear";
import type { Issue, IssueSearchPayload, IssueSearchResult } from "@linear/sdk";
import type { EmbedBuilder } from "../utils/embed-builder";

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

  let content = "";
  let issues: Issue[] | IssueSearchResult[] = [];
  if (!identifier.includes("-")) {
    const d = await Promise.all(
      await linear.client
        .searchIssues(identifier, { teamId })
        .then((e) => e.nodes.slice(0, 3)),
    );
    content = `Showing ${d.length} result${d.length === 1 ? "" : "s"} for ${bold(code(identifier))}`;
    issues = d;
  }

  if (issues.length === 0) {
    const issue = await (
      await linear.client.team(teamId)
    )
      .issues({
        filter: { id: { eq: identifier } },
      })
      .then((e) => e.nodes[0]);
    if (!issue) {
      return false;
    }
    issues = [issue];
  }

  if (issues.length === 0) {
    return false;
  }

  const embeds: EmbedBuilder[] = [];
  for (const issue of issues) {
    const creator = issue.creator ? await issue.creator : undefined;

    const embed = issueToEmbed({
      createdAt: issue.createdAt,
      dueDate: issue.dueDate,
      description: issue.description ?? "(no description)",
      identifier: issue.identifier,
      labels: Object.hasOwn(issue, "labels")
        ? (await (issue as Issue).labels()).nodes.map((l) => l.name)
        : [],
      state: issue.state ? (await issue.state)?.name : "(no state)",
      title: issue.title,
      url: issue.url,
      updatedAt: issue.updatedAt,
      creatorName: creator?.name,
      creatorPicture: creator?.avatarUrl ?? undefined,
    });

    embeds.push(embed);
  }

  await msg.reply({ embeds, content });

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
