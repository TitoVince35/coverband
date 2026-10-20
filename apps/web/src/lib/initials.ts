/** Leading words skipped when they aren't the whole name: "The Socks Pistils" is "SP". */
const ARTICLES = new Set(["the", "a", "an", "les", "le", "la", "l", "un", "une", "des"]);

/**
 * A band's initials, shown when it has no logo (#177): the first letter of its first two words,
 * after a leading article, in capitals ("The Socks Pistils" → "SP", "Queen" → "Q").
 */
export function bandInitials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = words[0]?.toLowerCase();
  const significant = first && ARTICLES.has(first) && words.length > 1 ? words.slice(1) : words;
  return significant
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toLocaleUpperCase();
}
