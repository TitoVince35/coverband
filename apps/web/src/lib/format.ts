/** Date and time in the user's language, e.g. "17 Oct 2026, 14:05" or "Oct 17, 2026, 2:05 PM". */
export function formatDateTime(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatDate(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value));
}
