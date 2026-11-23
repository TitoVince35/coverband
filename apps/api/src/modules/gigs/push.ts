import type { Language } from "@coverband/shared";
import type { AppDeps } from "../../deps";
import { membersOf } from "../bands/service";
import { type PushMessage, pushToUsers } from "../notifications/service";
import type { Gig } from "./service";

/** What happened to the gig: a push's sentence in each language (`{name}`, `{date}`). */
const PUSH_TEXTS: Record<"settled" | "cancelled", Record<Language, string>> = {
  settled: { en: "Gig settled: {name}, {date}", fr: "Concert confirmé : {name}, {date}" },
  cancelled: { en: "Gig cancelled: {name}, {date}", fr: "Concert annulé : {name}, {date}" },
};

/** A gig's date as a push says it: "Sat, Dec 19", « sam. 19 déc. ». */
export function pushDate(date: string, language: Language) {
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** A gig settled or cancelled, as a push to a band's member, in their device's language. */
export function gigPushMessage(
  band: { name: string; slug: string },
  gig: Gig,
  change: "settled" | "cancelled",
  language: Language,
): PushMessage {
  const name = gig.title ?? gig.venue?.name ?? "";
  return {
    title: band.name,
    body: PUSH_TEXTS[change][language]
      .replace("{name}", name)
      .replace("{date}", pushDate(gig.date, language)),
    url: `/b/${band.slug}/gigs/${gig.id}`,
  };
}

/**
 * Tells the band's members (but the one who did it) that a gig was settled or cancelled (#327),
 * with the push notifications they turned on. Nothing without push; never fails the request.
 */
export async function pushGigChange(
  deps: Pick<AppDeps, "db" | "log" | "push">,
  band: { id: string; name: string; slug: string },
  gig: Gig,
  change: "settled" | "cancelled",
  actorId: string,
) {
  const { push } = deps;
  if (!push) return;
  try {
    const members = await membersOf(deps.db, band.id);
    await pushToUsers(
      { db: deps.db, log: deps.log, push },
      members.map((member) => member.userId).filter((id) => id !== actorId),
      (language) => gigPushMessage(band, gig, change, language),
      { gigId: gig.id },
    );
  } catch (error) {
    deps.log.error("Gig push not sent", { gigId: gig.id, err: error });
  }
}
