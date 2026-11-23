import { type GigDay, gigDay } from "@coverband/shared";

// A gig's rules as the web app applies them (brief 034): pure functions, tested.

/** The device's time zone: the API decides "A gig's day" in it. */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A gig's name: its title, else its venue's name. */
export const gigName = (gig: { title: string | null; venue: { name: string } | null }) =>
  gig.title ?? gig.venue?.name ?? "";

/**
 * Directions to a venue in the phone's maps app, from its address (its name without one): Apple
 * Maps on an iPhone, Google Maps elsewhere (its app on Android). Works offline too: the app opens.
 */
export function directionsUrl(
  venue: { name: string; address: string | null; city: string },
  ios: boolean,
) {
  const destination = encodeURIComponent([venue.address ?? venue.name, venue.city].join(", "));
  return ios
    ? `https://maps.apple.com/?daddr=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/** Where a gig's day stands now on this device: today's, upcoming, or past (read-only). */
export const dayOf = (gig: { date: string }, now = new Date()): GigDay =>
  gigDay(gig.date, now, deviceTimeZone());

/** Whether this member settles, postpones, cancels and deletes the gig: its creator or a band leader. */
export const canManageGig = (
  gig: { createdById: string | null },
  member: { userId: string | undefined; isLeader: boolean },
) => member.isLeader || (member.userId !== undefined && gig.createdById === member.userId);

/**
 * What a member may do with a gig now (brief 034, "Life cycle"): edit (not cancelled nor past),
 * postpone (settled), cancel, delete (a proposed, cancelled or past one: a settled one is
 * cancelled first). The last three: its creator or a band leader, and none on a past gig but
 * delete.
 */
export function gigRights(
  gig: { status: string; date: string; createdById: string | null },
  member: { userId: string | undefined; isLeader: boolean },
  now = new Date(),
) {
  const past = dayOf(gig, now) === "past";
  const manager = canManageGig(gig, member);
  const open = gig.status !== "cancelled" && !past;
  return {
    past,
    manager,
    edit: open,
    settle: open && manager && gig.status === "proposed",
    postpone: open && manager && gig.status === "settled",
    cancel: open && manager,
    delete: manager && (gig.status !== "settled" || past),
  };
}

/**
 * A pay typed in euros ("400", "400,50", "1 200.5") as cents: null when blank, undefined when it
 * isn't an amount.
 */
export function parsePay(text: string): number | null | undefined {
  const cleaned = text.replace(/[\s  €]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

/** Cents as a form shows them: "400", "400.5" stays "400.50". */
export function payText(cents: number | null) {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** A pay in the language's way: "€400.00", "400,00 €". */
export function formatPay(cents: number, language: string) {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** How many upcoming gigs the band home's card lists (#331). */
export const HOME_UPCOMING_GIGS = 5;

/**
 * The band home's gigs (#331), from its next gigs at `now`, cancelled ones left out: today's
 * (by "A gig's day": still today's until 6 AM the next morning), and the upcoming ones, the
 * soonest first, the first HOME_UPCOMING_GIGS with how many there are in all.
 */
export function homeGigs<T extends { date: string; status: string }>(
  gigs: readonly T[],
  now = new Date(),
) {
  const live = gigs.filter((gig) => gig.status !== "cancelled");
  const today = live.filter((gig) => dayOf(gig, now) === "today");
  const upcoming = live
    .filter((gig) => dayOf(gig, now) === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    today,
    upcoming: upcoming.slice(0, HOME_UPCOMING_GIGS),
    upcomingCount: upcoming.length,
    toCome: today.length + upcoming.length,
  };
}
