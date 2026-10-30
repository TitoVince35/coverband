import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiRequestError, ensureOk } from "@/lib/errors";

export const myBandsQuery = queryOptions({
  queryKey: ["bands"],
  queryFn: async () => (await (await ensureOk(await api.bands.$get())).json()).bands,
});

/** Answers that won't change by asking again: the band suspended (#248), or none. */
const FINAL_CODES = new Set(["band_suspended", "not_found"]);

export const bandQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug],
    queryFn: async () =>
      (await ensureOk(await api.bands[":bandSlug"].$get({ param: { bandSlug } }))).json(),
    // Other failures (the network, a sleeping database) are retried as usual (3 times).
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && FINAL_CODES.has(error.code)) && failures < 3,
  });

export const membersQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "members"],
    queryFn: async () =>
      (
        await (
          await ensureOk(await api.bands[":bandSlug"].members.$get({ param: { bandSlug } }))
        ).json()
      ).members,
  });

/** Musician invitations of a band, for its leader. */
export const bandInvitations = (bandSlug: string) => ({
  queryKey: ["bands", bandSlug, "invitations"] as const,
  list: async () =>
    (
      await (
        await ensureOk(await api.bands[":bandSlug"].invitations.$get({ param: { bandSlug } }))
      ).json()
    ).invitations,
  invite: async (json: { email: string; language: "en" | "fr" }) =>
    ensureOk(await api.bands[":bandSlug"].invitations.$post({ param: { bandSlug }, json })),
  resend: async (id: string) =>
    ensureOk(
      await api.bands[":bandSlug"].invitations[":id"].resend.$post({ param: { bandSlug, id } }),
    ),
  revoke: async (id: string) =>
    ensureOk(await api.bands[":bandSlug"].invitations[":id"].$delete({ param: { bandSlug, id } })),
});

/** The band's journal: its latest activity, newest first. */
export const bandJournalQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "activity"],
    queryFn: async () =>
      (
        await (
          await ensureOk(await api.bands[":bandSlug"].activity.$get({ param: { bandSlug } }))
        ).json()
      ).entries,
  });
