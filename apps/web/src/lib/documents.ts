import type { Instrument } from "@coverband/shared";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

export type DocumentFields = { title: string; instruments: Instrument[] };

/**
 * Uploads a song's document (#239), reporting its progress (0 to 1): fetch can't, so this is the
 * one request through XMLHttpRequest. Errors are the API's (ApiRequestError) or the network's
 * (a TypeError, as fetch throws).
 */
export function uploadDocument(
  bandSlug: string,
  songId: string,
  file: File,
  fields: DocumentFields,
  onProgress: (done: number) => void,
) {
  const form = new FormData();
  form.set("file", file);
  form.set("title", fields.title);
  form.set("instruments", JSON.stringify(fields.instruments));
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/bands/${bandSlug}/songs/${songId}/documents`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      // The API's error, as ensureOk reads it.
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

/** Changes a document's title and instruments. */
export async function updateDocument(
  bandSlug: string,
  songId: string,
  documentId: string,
  json: Partial<DocumentFields>,
) {
  const route = api.bands[":bandSlug"].songs[":songId"].documents[":documentId"];
  await ensureOk(await route.$patch({ param: { bandSlug, songId, documentId }, json }));
}

/** Deletes a document (the member who added it, or the band leader). */
export async function deleteDocument(bandSlug: string, songId: string, documentId: string) {
  const route = api.bands[":bandSlug"].songs[":songId"].documents[":documentId"];
  await ensureOk(await route.$delete({ param: { bandSlug, songId, documentId } }));
}
