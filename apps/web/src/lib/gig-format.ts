// Gig dates and times as the app shows them. A gig's date is a calendar date (`YYYY-MM-DD`), never
// an instant: it is formatted as is, whatever the device's time zone.

const asDate = (date: string) => new Date(`${date}T12:00:00Z`);

const format = (date: string, language: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" }).format(asDate(date));

/** "Saturday, December 5" (the year when it isn't `thisYear`'s). */
export function formatGigDate(date: string, language: string, thisYear: number) {
  return format(date, language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.startsWith(String(thisYear)) ? {} : { year: "numeric" }),
  });
}

/** "Sat, Dec 5" (the year when it isn't `thisYear`'s). */
export function formatShortGigDate(date: string, language: string, thisYear: number) {
  return format(date, language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.startsWith(String(thisYear)) ? {} : { year: "numeric" }),
  });
}

/** The date's parts for a calendar tile: weekday, day and month, short. */
export function gigDateParts(date: string, language: string) {
  return {
    weekday: format(date, language, { weekday: "short" }),
    day: format(date, language, { day: "numeric" }),
    month: format(date, language, { month: "short" }),
    year: date.slice(0, 4),
  };
}

/** A time of day (`HH:MM`) in the language's way: "21:00", "9:00 PM". */
export function formatTimeOfDay(time: string, language: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0)));
}
