import type { Options } from "yargs-parser";
import yargsParser from "yargs-parser";
import { EmbedBuilder } from "./embed-builder";
import type { PermissionSet } from "@/handlers/permission-handler";

export function code(str: string) {
  return `\`${str}\``;
}

export function bold(str: string) {
  return `**${str}**`;
}

export function quote(str: string) {
  return `"${str}"`;
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

export function dueToSeconds(str: string): number | null {
  str = str.trim().toLowerCase();

  const units: Record<string, number> = {
    m: 60,
    min: 60,
    mins: 60,
    h: 60 * 60,
    hr: 60 * 60,
    hrs: 60 * 60,
    d: 24 * 60 * 60,
    day: 24 * 60 * 60,
    days: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
    mo: 30 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
    months: 30 * 24 * 60 * 60,
    y: 365 * 24 * 60 * 60,
    year: 365 * 24 * 60 * 60,
    years: 365 * 24 * 60 * 60,
    yr: 365 * 24 * 60 * 60,
    yrs: 365 * 24 * 60 * 60,
  };

  const match = str.match(/^(\d+)\s*(\w+)$/);
  if (!match) return null;

  const [, numStr, unit] = match;
  const num = parseInt(numStr!, 10);
  const u = unit!.replace(/s$/, "");

  if (!(u in units)) return null;

  return num * units[u]!;
}

export function isAll(perms: PermissionSet, value: boolean) {
  return Object.values(perms).every((v) => v === value);
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
