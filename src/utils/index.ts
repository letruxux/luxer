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
