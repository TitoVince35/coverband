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
