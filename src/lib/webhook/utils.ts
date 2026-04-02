export function getPriorityEmoji(priority: number): string {
  const PRIORITY_EMOJIS: Record<number, string> = {
    0: "🔘",
    1: "⬇️",
    2: "⏺️",
    3: "⬆️",
    4: "🔥",
  };
  return PRIORITY_EMOJIS[priority] || "🔘";
}

export function getStatusColor(status: string | undefined): number {
  const STATUS_COLORS: Record<string, number> = {
    done: 0x77b255,
    completed: 0x77b255,
    "in progress": 0xf2c94c,
    "in review": 0xffc107,
    canceled: 0x95a2b3,
    blocked: 0xff5722,
  };
  return STATUS_COLORS[status?.toLowerCase() ?? ""] || 0x5e6ad2;
}

export function getTimestampString(date: string | undefined): string {
  return `<t:${Math.floor(new Date(date ?? "").getTime() / 1000)}:R>`;
}