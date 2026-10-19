/**
 * The lineup as a member sees it: themselves first, then the others by display name, in the
 * language's alphabetical order (accents and case aside). Band leaders get no priority.
 */
export function lineupOrder<T extends { userId: string; name: string }>(
  members: readonly T[],
  userId: string,
  language: string,
): T[] {
  const collator = new Intl.Collator(language, { sensitivity: "base" });
  return [...members].sort(
    (a, b) =>
      Number(b.userId === userId) - Number(a.userId === userId) || collator.compare(a.name, b.name),
  );
}
