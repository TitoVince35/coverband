// Gigs (brief 034): a band's shows, at venues, on dates.

/** What kind of show a gig is. */
export const GIG_TYPES = ["public", "private", "recording"] as const;
export type GigType = (typeof GIG_TYPES)[number];

/** A gig's life cycle: proposed when created, settled, or cancelled (read-only then). */
export const GIG_STATUSES = ["proposed", "settled", "cancelled"] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

/** Length limits for a gig's and a venue's texts, shared by the API and the forms. */
export const GIG_MAX_LENGTH = {
  title: 100,
  cancelReason: 500,
  programNotes: 2000,
  payNotes: 200,
  backlineNotes: 500,
  notes: 4000,
} as const;

/** How many program links a gig keeps, and the highest pay it takes, in euro cents. */
export const GIG_LIMITS = { programLinks: 10, payCents: 100_000_000 } as const;
export const VENUE_MAX_LENGTH = {
  name: 100,
  city: 100,
  address: 300,
  description: 2000,
  linkTitle: 100,
  url: 2000,
} as const;

/** How many web links a venue keeps. */
export const VENUE_LIMITS = { links: 10 } as const;

/** A web link: an http(s) address and an optional title. */
export type WebLink = { url: string; title: string | null };

/**
 * When a gig's day ends (brief 034, "A gig's day"): gigs go on past midnight, so a gig's day runs
 * from midnight on its date until this hour the next morning, local time.
 */
export const GIG_DAY_END_HOUR = 6;

/** Which gigs: today's and upcoming ones (the default), past ones, or all of them. */
export const GIG_FILTERS = ["next", "past", "all"] as const;
export type GigFilter = (typeof GIG_FILTERS)[number];

/** Where a gig's day stands: under way (today's gig), not started yet, or over. */
export type GigDay = "today" | "upcoming" | "past";

/** A date as `YYYY-MM-DD`, moved by whole days (calendar arithmetic, no time zone). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return moved.toISOString().slice(0, 10);
}

/** The local date (`YYYY-MM-DD`) and hour at `now` in a time zone. */
export function localDateTime(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

/**
 * The earliest date whose gig day isn't over at `now` (local time in `timeZone`): today's date
 * from GIG_DAY_END_HOUR on, yesterday's before. A gig dated before it is past.
 */
export function firstCurrentGigDate(now: Date, timeZone: string): string {
  const { date, hour } = localDateTime(now, timeZone);
  return hour < GIG_DAY_END_HOUR ? addDays(date, -1) : date;
}

/**
 * Where a gig's day stands at `now` (brief 034): today's gig when its date is today, or was
 * yesterday and it isn't GIG_DAY_END_HOUR yet; upcoming when its date is later; else past. The
 * one rule for the lists, the home cards and the API's read-only check.
 */
export function gigDay(date: string, now: Date, timeZone: string): GigDay {
  const today = localDateTime(now, timeZone).date;
  if (date > today) return "upcoming";
  return date >= firstCurrentGigDate(now, timeZone) ? "today" : "past";
}

/** Whether a gig's date matches a filter at `now`: next is today's and upcoming gigs. */
export function inGigFilter(date: string, filter: GigFilter, now: Date, timeZone: string) {
  if (filter === "all") return true;
  const past = gigDay(date, now, timeZone) === "past";
  return filter === "past" ? past : !past;
}

/** A date as typed in a form (`YYYY-MM-DD`), when it is a real one. */
export function isGigDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/** A time of day as typed in a form (`HH:MM`, 24 hours). */
export const isTimeOfDay = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** A time zone the runtime knows. */
export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The time zone of a request that names none, or one the runtime doesn't know. */
export const DEFAULT_TIME_ZONE = "Europe/Paris";
