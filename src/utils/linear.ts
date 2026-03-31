import { bold, code } from ".";
import { EmbedBuilder } from "./embed-builder";

export function issueToEmbed(issue: {
  title: string;
  description: string;
  state: string;
  labels: string[];
  url: string;
  createdAt: Date;
  dueDate?: Date;
  creatorName?: string;
  creatorPicture?: string;
  updatedAt?: Date;
  identifier?: string;
}) {
  const embed = new EmbedBuilder()
    .setTitle(issue.identifier ? `[${issue.identifier}] ${issue.title}` : issue.title)
    .setDescription(
      `
${bold("State")}: ${issue.state}
${bold("Labels")}: ${issue.labels.length ? issue.labels.join(", ") : "(none)"}
${bold("Last updated")}: ${`<t:${Math.floor((issue.updatedAt ?? issue.createdAt).getTime() / 1000)}:R>`}
${bold("Due date")}: ${issue.dueDate ? `<t:${Math.floor(issue.dueDate.getTime() / 1000)}:R>` : "(none)"}

${issue.description}
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
