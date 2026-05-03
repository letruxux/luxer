import type { Options } from "yargs-parser";
import yargsParser from "yargs-parser";
import { EmbedBuilder } from "./embed-builder";
import type { Message } from "@fluxerjs/core";
import { db } from "@/db";
import { issueIdsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CommandUserError } from "@/handlers/command-handler";

export function code(str: string) {
  return `\`${str}\``;
}

export function bold(str: string) {
  return `**${str}**`;
}

export function quote(str: string) {
  return `"${str}"`;
}

export function isEmail(str: string) {
  return str.includes("@");
}

export function firstNonEmail(...strs: string[]) {
  for (const str of strs) {
    if (!isEmail(str)) return str;
  }
  return (strs[0] ?? "").split("@")[0] || "";
}

function capFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function fixCasing(str: string) {
  const withSpaces = str.replace(/_/g, " ");
  return capFirst(withSpaces.trim());
}

export function embedOf(embed: EmbedBuilder) {
  return { embeds: [embed] };
}

export function textEmbedOf(
  text: string,
  { title, color }: { title?: string; color?: number } = {},
) {
  const e = new EmbedBuilder().setDescription(text);
  if (title) e.setTitle(title);
  if (color) e.setColor(color);
  return embedOf(e);
}

export function yargs(args: string[], config: Options) {
  return new Map(Object.entries(yargsParser(args, config)));
}

export function filterIdArg(args: string[]) {
  const filteredArgs = args.filter((arg, i) => {
    if (arg === "--id" || arg === "-i") return false;
    if (i > 0 && (args[i - 1] === "--id" || args[i - 1] === "-i")) return false;
    return true;
  });

  return filteredArgs;
}

export function dueToSeconds(str: string): number | null {
  str = str.trim().toLowerCase();

  const now = new Date();

  if (str === "today") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return Math.floor((end.getTime() - now.getTime()) / 1000);
  }

  if (str === "tomorrow") {
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return Math.floor((end.getTime() - now.getTime()) / 1000);
  }

  const units: Record<string, number> = {
    m: 60,
    min: 60,
    mins: 60,
    h: 3600,
    hr: 3600,
    hrs: 3600,
    d: 86400,
    day: 86400,
    days: 86400,
    w: 604800,
    week: 604800,
    weeks: 604800,
    mo: 2592000,
    month: 2592000,
    months: 2592000,
    y: 31536000,
    year: 31536000,
    years: 31536000,
    yr: 31536000,
    yrs: 31536000,
  };

  const match = str.match(/^(\d+)\s*(\w+)$/);
  if (match) {
    const [, numStr, unit] = match;
    const num = parseInt(numStr!, 10);
    const u = unit!.replace(/s$/, "");

    if (!(u in units)) return null;
    return num * units[u]!;
  }

  let parsed: Date | null = null;

  const us = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    const month = Number(m);
    const day = Number(d);
    const year = Number(y);

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    parsed = new Date(year, month - 1, day);
  } else {
    const t = Date.parse(str);
    if (!isNaN(t)) {
      parsed = new Date(t);
    }
  }

  if (parsed) {
    const diff = parsed.getTime() - now.getTime();
    if (diff <= 0) return null;
    return Math.floor(diff / 1000);
  }

  return null;
}

export function countOccurrences(list: boolean[], value: boolean) {
  return list.filter((e) => e === value).length;
}

export function makeFluxerTimestamp(d: Date, type: "d" | "R") {
  const t = Math.floor(d.getTime() / 1000);
  return `<t:${t}:${type}>`;
}

export function removeNewlines(str: string) {
  return str.replaceAll("\n", " ").replaceAll("\r", "");
}

export function hyperlink(str: string, url: string) {
  return `[${str}](${url})`;
}

export async function parseArgsAndIssueId(
  msg: Message,
  args: string[],
): Promise<{ issueId: string; args: string[] }> {
  const issueId = msg.referencedMessage
    ? await db
        .select()
        .from(issueIdsMessages)
        .where(eq(issueIdsMessages.messageId, msg.referencedMessage!.id))
        .limit(1)
        .execute()
        .then((e) => e[0]?.issueId ?? undefined)
    : (yargs(args, { alias: { i: "id" } }).get("id") as string | undefined);

  if (!issueId) {
    throw new CommandUserError(
      "No issue provided, either reply to an issue or use the `--id <ABC-123>` flag",
    );
  }

  return { issueId, args: filterIdArg(args) };
}
