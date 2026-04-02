import type { Comment } from "@linear/sdk";
import { bold, hyperlink, makeFluxerTimestamp, removeNewlines } from ".";
import { EmbedBuilder } from "./embed-builder";
import { linearCache } from "@/lib/linear-cache";

const MAX_DESCRIPTION_LENGTH = 1900;
const MAX_COMMENTS = 3;

export async function buildCommentsPart(comments: Comment[]) {
  return comments.length
    ? `**💬 Comments** (last ${comments.length})\n${(
        await Promise.all(comments.map(formatComment))
      ).join("\n")}`
    : "";
}

export async function issueToEmbed(issue: {
  title: string;
  description: string;
  state: string;
  labels: string[];
  url: string;
  comments?: Comment[];
  createdAt: Date;
  dueDate?: Date;
  creatorName?: string;
  creatorPicture?: string;
  updatedAt?: Date;
  identifier?: string;
}) {
  const slicedComments = (issue.comments ?? [])
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_COMMENTS);

  const commentsString = await buildCommentsPart(slicedComments);

  const updated = issue.updatedAt ?? issue.createdAt;
  const due = issue.dueDate ? new Date(issue.dueDate) : null;

  const issueDesc = issue.description.trim();
  const description =
    issueDesc.length === 0
      ? "(no description)"
      : issueDesc.length > MAX_DESCRIPTION_LENGTH
        ? `${issueDesc.slice(0, MAX_DESCRIPTION_LENGTH)}... [more ${
            issueDesc.length - MAX_DESCRIPTION_LENGTH
          } characters]`
        : issueDesc;

  const embed = new EmbedBuilder()
    .setTitle(issue.identifier ? `[${issue.identifier}] ${issue.title}` : issue.title)
    .setDescription(
      [
        `${bold("State")}: ${issue.state}`,
        `${bold("Labels")}: ${issue.labels.length ? issue.labels.join(", ") : "(none)"}`,
        `${bold("Created")}: ${makeFluxerTimestamp(issue.createdAt, "R")}`,
        `${bold("Updated")}: ${makeFluxerTimestamp(updated, "R")}`,
        `${bold("Due date")}: ${
          due
            ? `${makeFluxerTimestamp(due, "d")}${
                Date.now() > due.getTime() ? " (overdue)" : ""
              }`
            : "(none)"
        }`,
        description ? `\n${description}\n` : "",
        commentsString,
      ].join("\n"),
    )
    .setAuthor({
      name: issue.creatorName ?? "Linear",
      iconURL: issue.creatorPicture,
    });

  if (issue.url) embed.setURL(issue.url);

  return embed;
}

async function formatComment(comment: Comment) {
  const user =
    comment.userId && comment.user
      ? await linearCache.user.getOrSet(comment.userId, comment.user)
      : undefined;

  return `${hyperlink(" 📎 ", comment.url)}${user?.name ?? "Unknown"}: ${removeNewlines(comment.body)} (${makeFluxerTimestamp(comment.createdAt, "R")})`;
}

export function isLinearIdentifier(str: string) {
  return str.match(/^[a-zA-Z]+-[0-9]+$/);
}
