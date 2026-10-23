// Songs' photos and PDFs kept on the device for offline use (#240): rehearsals often have no
// network. Like band logos (#178): files, not data, so not in the query cache and never through
// the service worker (private band data); in the app's offline database, emptied with the rest
// of the user's data. Guitar Pro and MuseScore files stay online only.

import { type DocumentKind, opensInApp } from "@coverband/shared";
import { DOCUMENT_STORE, runOffline } from "@/lib/offline-cache";

/** What the device keeps of documents at most, every band together: the newest first. */
export const OFFLINE_DOCUMENTS_MAX_BYTES = 100_000_000;

type SavedDocument = { id: string; bandSlug: string; size: number; blob: Blob; savedAt: number };

/** A document as the song's page has it. */
type Document = { id: string; kind: DocumentKind; size: number; createdAt: string; url: string };

const available = () => typeof indexedDB !== "undefined";

/**
 * The documents of a band to keep: its photos and PDFs, the newest first, as long as they fit in
 * the budget with what other bands keep.
 */
export function documentsToKeep(
  documents: readonly Pick<Document, "id" | "kind" | "size" | "createdAt">[],
  otherBytes: number,
  budget = OFFLINE_DOCUMENTS_MAX_BYTES,
) {
  const keep = new Set<string>();
  let used = otherBytes;
  const newestFirst = documents
    .filter((document) => opensInApp(document.kind))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const document of newestFirst) {
    if (used + document.size > budget) continue;
    used += document.size;
    keep.add(document.id);
  }
  return keep;
}

async function savedEntries() {
  return runOffline<SavedDocument[]>(DOCUMENT_STORE, "readonly", (store) => store.getAll());
}

/**
 * Keeps a band's photos and PDFs on the device: each downloaded once (its file never changes),
 * removed once its document is gone or no longer fits. Best effort: a failure only means fewer
 * documents offline.
 */
export async function keepDocumentsOffline(bandSlug: string, documents: readonly Document[]) {
  if (!available()) return;
  try {
    const saved = await savedEntries();
    const others = saved
      .filter((entry) => entry.bandSlug !== bandSlug)
      .reduce((bytes, entry) => bytes + entry.size, 0);
    const keep = documentsToKeep(documents, others);
    for (const entry of saved) {
      if (entry.bandSlug === bandSlug && !keep.has(entry.id)) {
        await runOffline(DOCUMENT_STORE, "readwrite", (store) => store.delete(entry.id));
      }
    }
    const have = new Set(saved.map((entry) => entry.id));
    for (const document of documents) {
      if (!keep.has(document.id) || have.has(document.id)) continue;
      const res = await fetch(document.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const entry: SavedDocument = {
        id: document.id,
        bandSlug,
        size: blob.size,
        blob,
        savedAt: Date.now(),
      };
      await runOffline(DOCUMENT_STORE, "readwrite", (store) => store.put(entry, document.id));
    }
  } catch {
    // Fewer documents offline this time.
  }
}

/** The saved copy of a document, or null. */
export async function savedDocument(id: string) {
  if (!available()) return null;
  const entry = await runOffline<SavedDocument | undefined>(DOCUMENT_STORE, "readonly", (store) =>
    store.get(id),
  ).catch(() => undefined);
  return entry?.blob ?? null;
}

/** Forgets every saved document (logout, another account logging in). */
export async function clearSavedDocuments() {
  if (!available()) return;
  await runOffline(DOCUMENT_STORE, "readwrite", (store) => store.clear()).catch(() => {});
}
