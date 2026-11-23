import type { BandContactType, GigFilter, GigType, WebLink } from "@coverband/shared";
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
  contactIds?: string[];
  coordinates?: { latitude: number; longitude: number };
};

/** A gig's main details, as its form sends them. */
export type GigInput = {
  date: string;
  title: string | null;
  type: GigType;
  showTime: string | null;
  venue: VenueInput | null;
  setlistId: string | null;
  getInTime: string | null;
  programLinks: WebLink[];
  programNotes: string | null;
  payCents: number | null;
  payNotes: string | null;
  sharedBackline: boolean;
  backlineNotes: string | null;
  techniciansProvided: boolean;
  notes: string | null;
  contactIds?: string[];
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

/** The band's contacts (#329), by name, with where they're used. */
export const bandContactsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "contacts"],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].contacts.$get({ param: { bandSlug }, query: {} }),
          )
        ).json()
      ).contacts,
  });

export type BandContactSummary = Awaited<
  ReturnType<ReturnType<typeof bandContactsQuery>["queryFn"] & {}>
>[number];

/** A contact as a gig or a venue lists it. */
export type BandContact = {
  id: string;
  name: string;
  type: BandContactType;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

/** A contact's details, as its dialog sends them. */
export type BandContactInput = Omit<BandContact, "id">;

/** Adds a contact to the band. */
export async function createBandContact(bandSlug: string, json: BandContactInput) {
  const res = await api.bands[":bandSlug"].contacts.$post({ param: { bandSlug }, json });
  return (await (await ensureOk(res)).json()).contact;
}

/** Changes a contact's details: every gig and venue listing it shows them. */
export async function updateBandContact(
  bandSlug: string,
  contactId: string,
  json: BandContactInput,
) {
  const res = await api.bands[":bandSlug"].contacts[":contactId"].$patch({
    param: { bandSlug, contactId },
    json,
  });
  return (await (await ensureOk(res)).json()).contact;
}

/**
 * Uploads a gig's poster (#330), reporting its progress (0 to 1), like a song's documents: the
 * one request through XMLHttpRequest. Errors are the API's (ApiRequestError) or the network's.
 */
export function uploadPoster(
  bandSlug: string,
  gigId: string,
  file: File,
  title: string,
  onProgress: (done: number) => void,
) {
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  const tz = encodeURIComponent(deviceTimeZone());
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/bands/${bandSlug}/gigs/${gigId}/posters?tz=${tz}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      void ensureOk({
        ok: false,
        status: request.status,
        json: async () => JSON.parse(request.responseText) as unknown,
      }).catch(reject);
    };
    request.onerror = () => reject(new TypeError("Network error"));
    request.send(form);
  });
}

/** Removes a gig's poster (who added it, or the band leader). */
export async function removePoster(bandSlug: string, gigId: string, posterId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].gigs[":gigId"].posters[":posterId"].$delete({
      param: { bandSlug, gigId, posterId },
      query: { tz: deviceTimeZone() },
    }),
  );
}

/** One venue of the band (#334), with its contacts and its gigs, the latest first. */
export const venueQuery = (bandSlug: string, venueId: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "venues", venueId],
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && error.code === "not_found") && failures < 3,
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].venues[":venueId"].$get({ param: { bandSlug, venueId } }),
          )
        ).json()
      ).venue,
  });

export type VenueDetails = Awaited<ReturnType<ReturnType<typeof venueQuery>["queryFn"] & {}>>;

/** Adds a venue from the venues page; throws `venue_taken`. */
export async function createVenue(bandSlug: string, json: Omit<VenueInput, "id">) {
  const res = await api.bands[":bandSlug"].venues.$post({ param: { bandSlug }, json });
  return (await (await ensureOk(res)).json()).venue;
}

/** Saves a venue's details: every gig there shows them; throws `venue_taken`. */
export async function updateVenue(bandSlug: string, venueId: string, json: Omit<VenueInput, "id">) {
  const res = await api.bands[":bandSlug"].venues[":venueId"].$patch({
    param: { bandSlug, venueId },
    json,
  });
  return (await (await ensureOk(res)).json()).venue;
}

/** Deletes a venue no gig uses; throws `venue_in_use`. */
export async function deleteVenue(bandSlug: string, venueId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].venues[":venueId"].$delete({ param: { bandSlug, venueId } }),
  );
}

/** Deletes a contact: gone from every gig and venue. */
export async function deleteBandContact(bandSlug: string, contactId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].contacts[":contactId"].$delete({
      param: { bandSlug, contactId },
    }),
  );
}

/** Merges `from` into a contact (the same person twice), with the details kept. */
export async function mergeBandContacts(
  bandSlug: string,
  contactId: string,
  from: string,
  details: BandContactInput,
) {
  const res = await api.bands[":bandSlug"].contacts[":contactId"].merge.$post({
    param: { bandSlug, contactId },
    json: { from, details },
  });
  return (await (await ensureOk(res)).json()).contact;
}
