import type { Comment } from "@linear/sdk";
import { bold } from ".";
import { EmbedBuilder } from "./embed-builder";

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
  const slicedComments = issue.comments?.slice(0, 3) ?? [];
  const cachedUsers = new Map<string, { name: string; id: string }>();
  const DEFAULT_USER = { name: "Unknown", id: "Unknown" };
  async function formatComment(comment: Comment) {
    const user = comment.userId
      ? cachedUsers.has(comment.userId)
        ? cachedUsers.get(comment.userId)!
        : ((await comment.user?.then((u) => ({
            name: u.name,
            id: u.id,
          }))) ?? DEFAULT_USER)
      : DEFAULT_USER;
    if (comment.userId && JSON.stringify(DEFAULT_USER) !== JSON.stringify(user)) {
      cachedUsers.set(comment.userId, user);
    }

    return `[📎](${comment.url}) ${user.name}: ${comment.body.replaceAll("\n", " ")} (<t:${Math.floor(comment.createdAt.getTime() / 1000)}:R>)`;
  }
  const commentsString =
    slicedComments.length > 0
      ? `**💬 Comments**: (Showing last ${slicedComments.length})
${(await Promise.all(slicedComments.map(formatComment))).join("\n")}
  `
      : "";

  const embed = new EmbedBuilder()
    .setTitle(issue.identifier ? `[${issue.identifier}] ${issue.title}` : issue.title)
    .setDescription(
      `
${bold("State")}: ${issue.state}
${bold("Labels")}: ${issue.labels.length ? issue.labels.join(", ") : "(none)"}
${bold("Last updated")}: ${`<t:${Math.floor((issue.updatedAt ?? issue.createdAt).getTime() / 1000)}:R>`}
${bold("Due date")}: ${issue.dueDate ? `<t:${Math.floor(new Date(issue.dueDate).getTime() / 1000)}:d> ${Date.now() > new Date(issue.dueDate).getTime() ? "(overdue)" : ""}` : "(none)"}

${issue.description.slice(0, 2000)}${issue.description.length > 2000 ? `... [more ${issue.description.length - 2000} characters]` : ""} 

${commentsString}
      `.trim(),
    )
    .setAuthor({
      name: issue.creatorName ?? "Linear",
      iconURL: issue.creatorPicture,
    })
    .setTimestamp(issue.createdAt);

  if (issue.url) {
    embed.setURL(issue.url);
  }

  return embed;
}
