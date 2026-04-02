import { getPriorityEmoji, getStatusColor, getTimestampString } from "./utils";

interface LinearActor {
  name: string;
}

interface LinearTeam {
  key: string;
  name: string;
}

interface LinearState {
  name: string;
}

interface LinearLabel {
  name: string;
}

interface LinearAssignee {
  name: string;
}

interface LinearIssueData {
  team?: LinearTeam;
  number: number;
  title: string;
  state?: LinearState;
  priority: number;
  assignee?: LinearAssignee;
  labels?: LinearLabel[];
  updatedAt?: string;
  createdAt?: string;
  url?: string;
}

interface LinearCommentIssue {
  identifier: string;
}

interface LinearCommentData {
  issue: LinearCommentIssue;
  user: { name: string };
  createdAt: string;
}

interface LinearData {
  action: string;
  actor?: LinearActor;
  data: LinearIssueData | LinearCommentData;
  type: string;
}

export interface DiscordMessage {
  content?: string;
  embeds: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

function handleIssueUpdate({
  action,
  actor,
  data,
}: {
  action: string;
  actor?: LinearActor;
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

  const actionFormat =
    ACTION_FORMATS[action] || {
      emoji: "ℹ️",
      description: `Issue ${action} ${timestamp}`,
    };

  const content = `${data.state?.name === "Done" ? "✅" : ""} **${actor?.name ?? "Someone"}** changed issue status to **${data.state?.name}** in [${data.team?.name ?? "Unknown"} Team](${data.url ?? issueUrl})`;

  const fields: DiscordField[] = [
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

  return {
    content,
    embeds: [
      {
        title: `${actionFormat.emoji} ${issueName}: ${data.title}`,
        url: issueUrl,
        description: actionFormat.description,
        color: getStatusColor(data.state?.name),
        fields,
        footer: {
          text: `${data.team?.name ?? "Unknown Team"} • ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        },
        timestamp: new Date(data.updatedAt ?? data.createdAt ?? "").toISOString(),
      },
    ],
  };
}

function handleCommentUpdate({
  data,
}: {
  data: LinearCommentData;
}): DiscordMessage {
  return {
    embeds: [
      {
        title: `💬 New comment on ${data.issue.identifier}`,
        url: `https://linear.app/issue/${data.issue.identifier}`,
        color: 0x5e6ad2,
        footer: {
          text: `Comment by ${data.user.name}`,
        },
        timestamp: new Date(data.createdAt).toISOString(),
      },
    ],
  };
}

function handleDefaultUpdate({
  action,
  type,
}: {
  action: string;
  type: string;
}): DiscordMessage {
  return {
    embeds: [
      {
        title: `Linear Update: ${type}`,
        description: `A ${type} was ${action}ed`,
        color: 0x5e6ad2,
      },
    ],
  };
}

export function createDiscordMessage(linearData: LinearData): DiscordMessage {
  const { action, actor, data, type } = linearData;

  const handlers: Record<string, (params: { action: string; actor?: LinearActor; data: LinearData["data"]; type: string }) => DiscordMessage> = {
    Issue: ({ action, actor, data }) => handleIssueUpdate({ action, actor, data: data as LinearIssueData }),
    Comment: ({ data }) => handleCommentUpdate({ data: data as LinearCommentData }),
    default: ({ action, type }) => handleDefaultUpdate({ action, type }),
  };

  const handler = handlers[type] ?? handlers.default;
  if (!handler) return handleDefaultUpdate({ action, type });
  return handler({ action, actor, data, type });
}