import type {
  EntityWebhookPayloadWithIssueData,
  EntityWebhookPayloadWithCommentData,
  EntityWebhookPayloadWithEntityData,
} from "@linear/sdk/webhooks";
import { EmbedBuilder } from "@/utils/embed-builder";
import { getPriorityEmoji, getStatusColor, getTimestampString } from "./utils";

type LinearIssueData = EntityWebhookPayloadWithIssueData["data"];
type LinearCommentData = EntityWebhookPayloadWithCommentData["data"];
type LinearActor = EntityWebhookPayloadWithIssueData["actor"];

function getActorName(actor: LinearActor): string {
  if (!actor) return "Unknown";
  if (actor.__typename === "UserActorWebhookPayload") {
    return actor.name;
  }
  return "Unknown";
}

export interface DiscordMessage {
  content?: string;
  embeds: ReturnType<EmbedBuilder["toJSON"]>[];
}

function handleIssueUpdate({
  action,
  actor,
  data,
}: {
  action: string;
  actor?: EntityWebhookPayloadWithIssueData["actor"];
  data: LinearIssueData;
}): DiscordMessage {
  const issueName = `${data.team?.key}-${data.number}`;
  const issueUrl = `https://linear.app/issue/${issueName}`;
  const priorityEmoji = getPriorityEmoji(data.priority);
  const timestamp = getTimestampString(data.updatedAt || data.createdAt);

  const ACTION_FORMATS: Record<string, { emoji: string; description: string }> = {
    create: { emoji: "🆕", description: `New issue created ${timestamp}` },
    update: { emoji: "📝", description: `Issue updated ${timestamp}` },
    remove: { emoji: "🗑️", description: `Issue deleted ${timestamp}` },
  };

  const actionFormat = ACTION_FORMATS[action] || {
    emoji: "ℹ️",
    description: `Issue ${action} ${timestamp}`,
  };

  const content = `${data.state?.name === "Done" ? "✅" : ""} **${getActorName(actor)}** changed issue status to **${data.state?.name}** in [${data.team?.name ?? "Unknown"} Team](${data.url ?? issueUrl})`;

  const embed = new EmbedBuilder()
    .setTitle(`${actionFormat.emoji} ${issueName}: ${data.title}`)
    .setURL(issueUrl)
    .setDescription(actionFormat.description)
    .setColor(getStatusColor(data.state?.name))
    .setTimestamp(new Date(data.updatedAt ?? data.createdAt ?? ""))
    .setFooter({
      text: `${data.team?.name ?? "Unknown Team"} • ${action.charAt(0).toUpperCase() + action.slice(1)}`,
    });

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "Status",
      value: data.state?.name ?? "No status",
      inline: true,
    },
    {
      name: "Priority",
      value: `${priorityEmoji} ${data.priority ? `P${data.priority}` : "None"}`,
      inline: true,
    },
    {
      name: "Assignee",
      value: data.assignee?.name ?? "Unassigned",
      inline: true,
    },
  ];

  if (data.labels?.length) {
    fields.push({
      name: "Labels",
      value: data.labels.map((label) => `\`${label.name}\``).join(", "),
      inline: false,
    });
  }

  embed.addFields(...fields);

  return {
    content,
    embeds: [embed.toJSON()],
  };
}

function handleCommentUpdate({ data }: { data: LinearCommentData }): DiscordMessage {
  const embed = new EmbedBuilder()
    .setTitle(`💬 New comment on ${data.issue?.identifier}`)
    .setURL(`https://linear.app/issue/${data.issue?.identifier}`)
    .setTimestamp(new Date(data.createdAt))
    .setFooter({
      text: `Comment by ${data.user?.name ?? "Unknown"}`,
    });

  return {
    embeds: [embed.toJSON()],
  };
}

function handleDefaultUpdate({
  action,
  type,
}: {
  action: string;
  type: string;
}): DiscordMessage {
  const embed = new EmbedBuilder()
    .setTitle(`Linear Update: ${type}`)
    .setDescription(`A ${type} was ${action}ed`);

  return {
    embeds: [embed.toJSON()],
  };
}

type IssuePayload = EntityWebhookPayloadWithIssueData;
type CommentPayload = EntityWebhookPayloadWithCommentData;
type WebhookPayload = EntityWebhookPayloadWithEntityData;

export function createDiscordMessage(linearData: WebhookPayload): DiscordMessage {
  const { action, actor, data, type } = linearData;

  const handlers: Record<
    string,
    (params: {
      action: string;
      actor?: LinearActor;
      data: unknown;
      type: string;
    }) => DiscordMessage
  > = {
    Issue: ({ action, actor, data }) =>
      handleIssueUpdate({ action, actor, data: data as IssuePayload["data"] }),
    Comment: ({ data }) => handleCommentUpdate({ data: data as CommentPayload["data"] }),
    default: ({ action, type }) => handleDefaultUpdate({ action, type }),
  };

  const handler = handlers[type] ?? handlers.default;
  if (!handler) return handleDefaultUpdate({ action, type });
  return handler({ action, actor, data, type });
}
