import type { EmbedBuilder } from "@fluxerjs/core";
import type { Options } from "yargs-parser";
import yargsParser from "yargs-parser";

export function code(str: string) {
  return `\`${str}\``;
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

export function yargs(args: string[], config: Options) {
  return new Map(Object.entries(yargsParser(args, config)));
}
