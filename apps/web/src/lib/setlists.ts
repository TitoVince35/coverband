import type { Language, SetlistExportFormat } from "@coverband/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiRequestError, ensureOk } from "@/lib/errors";

// A band's setlists (brief 026): queries and mutations. Their query keys sit under the band's
// (["bands", bandSlug, "setlists", …]), so a change invalidates them with the band's other data.

/** A band's current setlists, the latest changed first. */
export const setlistsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "setlists"],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].setlists.$get({ param: { bandSlug }, query: {} }),
          )
        ).json()
      ).setlists,
  });

export type SetlistSummary = Awaited<
  ReturnType<ReturnType<typeof setlistsQuery>["queryFn"] & {}>
>[number];

/** A band's archived setlists, the latest changed first. */
export const archivedSetlistsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "setlists", "archived"],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].setlists.$get({
              param: { bandSlug },
              query: { archived: "true" },
            }),
          )
        ).json()
      ).setlists,
  });

/** One setlist. */
export const setlistQuery = (bandSlug: string, setlistId: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "setlists", setlistId],
    // A setlist that isn't there won't appear by asking again: say so at once.
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && error.code === "not_found") && failures < 3,
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].setlists[":setlistId"].$get({
              param: { bandSlug, setlistId },
            }),
          )
        ).json()
      ).setlist,
  });

/** Creates a setlist; throws `setlist_title_taken` or `too_many_setlists`. */
export async function createSetlist(bandSlug: string, title: string) {
  const res = await api.bands[":bandSlug"].setlists.$post({
    param: { bandSlug },
    json: { title },
  });
  return (await (await ensureOk(res)).json()).setlist;
}

/** Renames a setlist; throws `setlist_title_taken`, or `setlist_archived`. */
export async function renameSetlist(bandSlug: string, setlistId: string, title: string) {
  const res = await api.bands[":bandSlug"].setlists[":setlistId"].$patch({
    param: { bandSlug, setlistId },
    json: { title },
  });
  return (await (await ensureOk(res)).json()).setlist;
}

/** Archives a setlist, or restores it (throws `too_many_setlists` when the band is full). */
export async function setSetlistArchived(bandSlug: string, setlistId: string, archived: boolean) {
  const param = { bandSlug, setlistId };
  const route = api.bands[":bandSlug"].setlists[":setlistId"];
  const res = archived
    ? await route.archive.$post({ param })
    : await route.restore.$post({ param });
  return (await (await ensureOk(res)).json()).setlist;
}

/** Deletes a setlist for good (the band leader, or its author). */
export async function deleteSetlist(bandSlug: string, setlistId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].setlists[":setlistId"].$delete({
      param: { bandSlug, setlistId },
    }),
  );
}

/** Whether this member may delete the setlist: the band leader, or its author. */
export const canDeleteSetlist = (
  setlist: { createdById: string | null },
  member: { userId: string | undefined; isLeader: boolean },
) => member.isLeader || (member.userId !== undefined && setlist.createdById === member.userId);

export type Setlist = Awaited<ReturnType<ReturnType<typeof setlistQuery>["queryFn"] & {}>>;

/**
 * Saves a setlist's whole content (#272), read at `version`; throws `setlist_outdated` when
 * someone saved it since.
 */
export async function saveSetlistContent(
  bandSlug: string,
  setlistId: string,
  json: { version: number; parts: { name: string | null; songs: string[] }[] },
) {
  const res = await api.bands[":bandSlug"].setlists[":setlistId"].content.$put({
    param: { bandSlug, setlistId },
    json,
  });
  return (await (await ensureOk(res)).json()).setlist;
}

/**
 * Duplicates a setlist (#273): a copy with the same parts and songs, titled `title` (numbered
 * by the API when taken); throws `too_many_setlists` when the band is full.
 */
export async function duplicateSetlist(bandSlug: string, setlistId: string, title: string) {
  const res = await api.bands[":bandSlug"].setlists[":setlistId"].duplicate.$post({
    param: { bandSlug, setlistId },
    json: { title },
  });
  return (await (await ensureOk(res)).json()).setlist;
}

/** The file name a download's `Content-Disposition` gives (its UTF-8 form first), or null. */
export function downloadName(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // Malformed: fall back to the plain name.
    }
  }
  return /filename="([^"]*)"/i.exec(disposition)?.[1] ?? null;
}

/**
 * A setlist's export (brief 030), in the app's language and the device's time zone: the API
 * serves the stored file while the setlist shows the same, or makes a new one.
 */
export async function fetchSetlistExport(
  bandSlug: string,
  setlistId: string,
  format: SetlistExportFormat,
  language: Language,
) {
  const res = await ensureOk(
    await api.bands[":bandSlug"].setlists[":setlistId"].exports[":format"].$get({
      param: { bandSlug, setlistId, format },
      query: { lang: language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
  );
  return { blob: await res.blob(), name: downloadName(res.headers.get("content-disposition")) };
}

/**
 * The address of a setlist's export, in the app's language and the device's time zone: the PDF
 * opens there in a new tab, where the browser prints it. It carries the setlist's version, so a
 * saved change gives a new address that no browser has kept a copy of.
 */
export function setlistExportUrl(
  bandSlug: string,
  setlistId: string,
  format: SetlistExportFormat,
  language: Language,
  version: number,
) {
  const url = api.bands[":bandSlug"].setlists[":setlistId"].exports[":format"].$url({
    param: { bandSlug, setlistId, format },
    query: {
      lang: language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      v: String(version),
    },
  });
  return `${url.pathname}${url.search}`;
}

/** Saves a file on the device, as a download. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the browser has taken the file.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
