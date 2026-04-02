import {
  CommandLinearError,
  CommandUserError,
  type Command,
} from "@/handlers/command-handler";
import { code, embedOf, hyperlink, parseArgsAndIssueId, textEmbedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { linearCache } from "@/lib/linear-cache";
import { buildIssueEmbed } from "./issues";
import { buildCommentsPart } from "@/utils/linear";
import { askConfirmation } from "./_confirmation";

export const comment = {
  name: "comment",
  description: "Comment on an issue",
  guildOnly: true,
  requireAccountLinked: true,
  requireConfig: true,
  async execute(msg, args, extra) {
    const linear = extra.userLinear!;

    const { issueId, args: filteredArgs } = await parseArgsAndIssueId(msg, args);

    const issue = await linearCache.issue.getOrSet(issueId, linear.client.issue(issueId));

    const comments = await linear.client
      .comments({
        filter: { issue: { id: { eq: issue.id } } },
      })
      .then((e) => e.nodes.reverse());
    if (!issue) {
      throw new CommandUserError("Issue not found");
    }

    let body = filteredArgs.join(" ").trim();
    let i = 1;
    for (const attachment of msg.attachments.values()) {
      if (attachment.url) {
        body += `\n${attachment.content_type?.startsWith("image") ? "!" : ""}${hyperlink(`attachment ${i + 1}`, attachment.url)}`;
        i++;
      }
    }

    if (body.length === 0) {
      throw new CommandUserError("No comment body provided");
    }

    const viewer = await linear.getViewer();

    const confirmationEmbed = new EmbedBuilder()
      .setTitle(`Re: [${issue.identifier}] ${issue.title}`)
      .setDescription(body)
      .setAuthor({
        name: viewer.name,
        iconURL: viewer.avatarUrl ?? undefined,
        url: viewer.url,
      })
      .setColor(0x00ff00);

    const { confirmed, message: respMsg } = await askConfirmation({
      msg,
      content: "**Are you sure?** (Expires in 2m)",
      embed: confirmationEmbed,
    });

    if (!confirmed) return;

    const result = await linear.client.createComment({
      issueId,
      body,
    });
    if (!result) throw new CommandLinearError();
    if (!result.comment) throw new CommandLinearError();

    linearCache.issue.invalidate(issueId);

    const prefix = await msg.client.handlers.command.getPrefix(msg);

    const resultComment = await result.comment;
    const newComments = [...comments, resultComment].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const commentsString = await buildCommentsPart(newComments);
    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `${commentsString}\n\nRun \`${prefix}issue ${issue ? issue.identifier : issueId}\` to view the updated issue`,
      )
      .setTitle(`Comment added under ${code(issue.identifier)}!`)
      .setColor(0x00ff00);

    await respMsg.edit({
      embeds: [finalEmbed],
    });
  },
} satisfies Command;
