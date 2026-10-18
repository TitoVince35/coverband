/** Date and time in the user's language, e.g. "17 Oct 2026, 14:05" or "Oct 17, 2026, 2:05 PM". */
export function formatDateTime(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatDate(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value));
}

/**
 * When a journal entry happened, in the viewer's time zone: "Today 10:43", "Yesterday 21:05",
 * "12 Oct 23:45", with the year when it isn't this year. `words` are the translated day names.
 */
export function formatJournalTime(
  value: string | Date,
  now: Date,
  language: string,
  words: { today: string; yesterday: string },
): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(date);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(date)) / 86_400_000);
  if (daysAgo === 0) return `${words.today} ${time}`;
  if (daysAgo === 1) return `${words.yesterday} ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  const dayAndMonth = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
  return `${dayAndMonth} ${time}`;
}
