import type { GigFilter, GigType, WebLink } from "@coverband/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiRequestError, ensureOk } from "@/lib/errors";
import { deviceTimeZone } from "@/lib/gig-rules";

// A band's gigs and venues (brief 034): queries and mutations. Their query keys sit under the
// band's (["bands", bandSlug, "gigs", …]), so a change invalidates them with the band's other data.

/** A band's gigs: next (today's and upcoming, the default), past, or all. */
export const gigsQuery = (bandSlug: string, when: GigFilter = "next") =>
  queryOptions({
    queryKey: ["bands", bandSlug, "gigs", "list", when],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].gigs.$get({
              param: { bandSlug },
              query: { when, tz: deviceTimeZone() },
            }),
          )
        ).json()
      ).gigs,
  });

export type GigSummary = Awaited<ReturnType<ReturnType<typeof gigsQuery>["queryFn"] & {}>>[number];

/** One gig, with its venue. */
export const gigQuery = (bandSlug: string, gigId: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "gigs", gigId],
    // A gig that isn't there won't appear by asking again: say so at once.
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && error.code === "not_found") && failures < 3,
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].gigs[":gigId"].$get({ param: { bandSlug, gigId } }),
          )
        ).json()
      ).gig,
  });

export type Gig = Awaited<ReturnType<ReturnType<typeof gigQuery>["queryFn"] & {}>>;

/** The band's venues, by name, with their number of gigs. */
export const venuesQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "venues"],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].venues.$get({ param: { bandSlug }, query: {} }),
          )
        ).json()
      ).venues,
  });

export type VenueSummary = Awaited<
  ReturnType<ReturnType<typeof venuesQuery>["queryFn"] & {}>
>[number];

/** A venue's details, as the gig form sends them. */
export type VenueInput = {
  id?: string;
  name: string;
  city: string;
  address: string | null;
  links: WebLink[];
  description: string | null;
};

/** A gig's main details, as its form sends them. */
export type GigInput = {
  date: string;
  title: string | null;
  type: GigType;
  showTime: string | null;
  venue: VenueInput | null;
};

/** Creates a gig, with a new venue saved along; throws `venue_taken`. */
export async function createGig(bandSlug: string, json: GigInput) {
  const res = await api.bands[":bandSlug"].gigs.$post({ param: { bandSlug }, json });
  return (await (await ensureOk(res)).json()).gig;
}

/** Saves a gig read at `version`; throws `gig_outdated` when someone saved it since. */
export async function updateGig(
  bandSlug: string,
  gigId: string,
  json: GigInput & { version: number },
) {
  const res = await api.bands[":bandSlug"].gigs[":gigId"].$patch({
    param: { bandSlug, gigId },
    query: { tz: deviceTimeZone() },
    json,
  });
  return (await (await ensureOk(res)).json()).gig;
}

/** Settles a proposed gig (its creator or a band leader); the band's members get a push. */
export async function settleGig(bandSlug: string, gigId: string) {
  const res = await api.bands[":bandSlug"].gigs[":gigId"].settle.$post({
    param: { bandSlug, gigId },
    query: { tz: deviceTimeZone() },
  });
  return (await (await ensureOk(res)).json()).gig;
}

/** Brings a settled gig back to proposed, to change its date, title or venue. */
export async function postponeGig(bandSlug: string, gigId: string) {
  const res = await api.bands[":bandSlug"].gigs[":gigId"].postpone.$post({
    param: { bandSlug, gigId },
    query: { tz: deviceTimeZone() },
  });
  return (await (await ensureOk(res)).json()).gig;
}

/** Cancels a gig with its reason; it is read-only afterwards. */
export async function cancelGig(bandSlug: string, gigId: string, reason: string) {
  const res = await api.bands[":bandSlug"].gigs[":gigId"].cancel.$post({
    param: { bandSlug, gigId },
    query: { tz: deviceTimeZone() },
    json: { reason },
  });
  return (await (await ensureOk(res)).json()).gig;
}

/** Deletes a gig for good (a proposed, cancelled or past one); its venue stays. */
export async function deleteGig(bandSlug: string, gigId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].gigs[":gigId"].$delete({
      param: { bandSlug, gigId },
      query: { tz: deviceTimeZone() },
    }),
  );
}
