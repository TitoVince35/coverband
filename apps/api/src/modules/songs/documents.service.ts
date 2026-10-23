import { DOCUMENT_LIMITS, documentUrl } from "@coverband/shared";
import { and, asc, count, eq, sum } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { songDocuments, songs, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import type { AppDeps } from "../../deps";
import { cleanInstruments } from "../instruments/service";
import { documentType } from "./document-types";

type Deps = Pick<AppDeps, "db" | "storage" | "log">;
type Member = { bandId: string; userId: string };

/** Not a photo, PDF, Guitar Pro or MuseScore file. */
export class InvalidDocumentError extends AppError {
  constructor() {
    super("document_invalid", "Not a photo, PDF, Guitar Pro or MuseScore file");
  }
}

export class DocumentTooLargeError extends AppError {
  constructor() {
    super("document_too_large", `Documents are at most ${DOCUMENT_LIMITS.maxBytes} bytes`);
  }
}

export class TooManyDocumentsError extends AppError {
  constructor() {
    super("too_many_documents", `A song has at most ${DOCUMENT_LIMITS.perSong} documents`);
  }
}

/** The band's documents would go over its storage budget (the beta's). */
export class BandStorageFullError extends AppError {
  constructor() {
    super("band_storage_full", `A band's documents take at most ${DOCUMENT_LIMITS.perBand} bytes`);
  }
}

/** Only the member who added a document, or the band leader, deletes it. */
export class NotYourDocumentError extends AppError {
  constructor() {
    super("forbidden", "Only who added it or the band leader deletes a document");
  }
}

const columns = {
  id: songDocuments.id,
  songId: songDocuments.songId,
  title: songDocuments.title,
  kind: songDocuments.kind,
  extension: songDocuments.extension,
  size: songDocuments.size,
  instruments: songDocuments.instruments,
  addedById: songDocuments.addedById,
  // Their current display name; null once their account is deleted.
  addedBy: users.name,
  createdAt: songDocuments.createdAt,
};

/** A document as the API returns it, with its file's URL. */
function shown<R extends { id: string; songId: string }>(bandSlug: string, { songId, ...row }: R) {
  return { ...row, url: documentUrl(bandSlug, songId, row.id) };
}

const selectDocuments = (db: Db | Tx) =>
  db.select(columns).from(songDocuments).leftJoin(users, eq(users.id, songDocuments.addedById));

type Row = Awaited<ReturnType<typeof selectDocuments>>[number];

export type SongDocument = ReturnType<typeof shown<Row>>;

/** A song's documents, oldest first. */
export async function documentsOf(
  db: Db,
  band: { id: string; slug: string },
  songId: string,
): Promise<SongDocument[]> {
  const rows = await selectDocuments(db)
    .where(and(eq(songDocuments.bandId, band.id), eq(songDocuments.songId, songId)))
    .orderBy(asc(songDocuments.createdAt), asc(songDocuments.id));
  return rows.map((row) => shown(band.slug, row));
}

/** Every document of a band's songs, by song, each song's oldest first (offline, #165). */
export async function documentsOfBand(db: Db, band: { id: string; slug: string }) {
  const rows = await selectDocuments(db)
    .where(eq(songDocuments.bandId, band.id))
    .orderBy(asc(songDocuments.createdAt), asc(songDocuments.id));
  const bySong = new Map<string, SongDocument[]>();
  for (const row of rows) {
    bySong.set(row.songId, [...(bySong.get(row.songId) ?? []), shown(band.slug, row)]);
  }
  return (songId: string) => bySong.get(songId) ?? [];
}

/** Locks the band's song (false when there's none): document changes to one song wait. */
async function lockSong(tx: Tx, bandId: string, songId: string) {
  const [song] = await tx
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.bandId, bandId), eq(songs.id, songId)))
    .for("update");
  return song !== undefined;
}

/**
 * A member adds a document to a song (#238): its type read from its bytes and name, within the
 * limits. The file is stored first, under a new key; it is deleted again if the document isn't
 * saved. Null when the band has no such song.
 */
export async function addDocument(
  { db, storage, log }: Deps,
  member: Member & { bandSlug: string },
  songId: string,
  upload: { bytes: Uint8Array; fileName: string; title: string; instruments: readonly unknown[] },
): Promise<SongDocument | null> {
  if (upload.bytes.length > DOCUMENT_LIMITS.maxBytes) throw new DocumentTooLargeError();
  const type = documentType(upload.bytes, upload.fileName);
  if (!type) throw new InvalidDocumentError();
  const key = `bands/${member.bandId}/documents/${crypto.randomUUID()}.${type.extension}`;
  await storage.put(key, upload.bytes, type.contentType);
  try {
    const id = await db.transaction(async (tx) => {
      if (!(await lockSong(tx, member.bandId, songId))) return null;
      const [song] = await tx
        .select({ n: count() })
        .from(songDocuments)
        .where(eq(songDocuments.songId, songId));
      if ((song?.n ?? 0) >= DOCUMENT_LIMITS.perSong) throw new TooManyDocumentsError();
      const [band] = await tx
        .select({ bytes: sum(songDocuments.size) })
        .from(songDocuments)
        .where(eq(songDocuments.bandId, member.bandId));
      if (Number(band?.bytes ?? 0) + upload.bytes.length > DOCUMENT_LIMITS.perBand) {
        throw new BandStorageFullError();
      }
      const [document] = await tx
        .insert(songDocuments)
        .values({
          bandId: member.bandId,
          songId,
          title: upload.title,
          kind: type.kind,
          contentType: type.contentType,
          extension: type.extension,
          size: upload.bytes.length,
          storageKey: key,
          instruments: cleanInstruments(upload.instruments),
          addedById: member.userId,
        })
        .returning({ id: songDocuments.id });
      await recordActivity(tx, {
        action: "song.document_added",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "song", id: songId },
        data: { kind: type.kind },
      });
      return document?.id ?? null;
    });
    if (!id) {
      await deleteQuietly({ storage, log }, key);
      return null;
    }
    const [row] = await selectDocuments(db).where(eq(songDocuments.id, id));
    return row ? shown(member.bandSlug, row) : null;
  } catch (error) {
    await deleteQuietly({ storage, log }, key);
    throw error;
  }
}

/** Any member edits a document's title and instruments; its file never changes. */
export async function updateDocument(
  db: Db,
  member: Member & { bandSlug: string },
  songId: string,
  documentId: string,
  changes: { title?: string | undefined; instruments?: readonly unknown[] | undefined },
): Promise<SongDocument | null> {
  const updated = await db.transaction(async (tx) => {
    if (!(await lockSong(tx, member.bandId, songId))) return false;
    const rows = await tx
      .update(songDocuments)
      .set({
        ...(changes.title !== undefined && { title: changes.title }),
        ...(changes.instruments !== undefined && {
          instruments: cleanInstruments(changes.instruments),
        }),
      })
      .where(
        and(
          eq(songDocuments.bandId, member.bandId),
          eq(songDocuments.songId, songId),
          eq(songDocuments.id, documentId),
        ),
      )
      .returning({ id: songDocuments.id });
    if (rows.length === 0) return false;
    // A song update in the journal, as for its links.
    await recordActivity(tx, {
      action: "song.updated",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "song", id: songId },
      data: { fields: "documents" },
    });
    return true;
  });
  if (!updated) return null;
  const [row] = await selectDocuments(db).where(eq(songDocuments.id, documentId));
  return row ? shown(member.bandSlug, row) : null;
}

/**
 * Deletes a document: the member who added it or the band leader (NotYourDocumentError for the
 * others). Its file goes once the document is gone. False when there's no such document.
 */
export async function deleteDocument(
  deps: Deps,
  member: Member & { isLeader: boolean },
  songId: string,
  documentId: string,
) {
  const key = await deps.db.transaction(async (tx) => {
    if (!(await lockSong(tx, member.bandId, songId))) return null;
    const where = and(
      eq(songDocuments.bandId, member.bandId),
      eq(songDocuments.songId, songId),
      eq(songDocuments.id, documentId),
    );
    const [document] = await tx
      .select({ addedById: songDocuments.addedById, storageKey: songDocuments.storageKey })
      .from(songDocuments)
      .where(where);
    if (!document) return null;
    if (!member.isLeader && document.addedById !== member.userId) throw new NotYourDocumentError();
    await tx.delete(songDocuments).where(where);
    await recordActivity(tx, {
      action: "song.document_removed",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "song", id: songId },
    });
    return document.storageKey;
  });
  if (!key) return false;
  await deleteQuietly(deps, key);
  return true;
}

/** A document's file, with what serving it needs; null without such a document. */
export async function readDocument(
  { db, storage }: Deps,
  bandId: string,
  songId: string,
  documentId: string,
) {
  const [document] = await db
    .select({
      title: songDocuments.title,
      kind: songDocuments.kind,
      extension: songDocuments.extension,
      storageKey: songDocuments.storageKey,
    })
    .from(songDocuments)
    .where(
      and(
        eq(songDocuments.bandId, bandId),
        eq(songDocuments.songId, songId),
        eq(songDocuments.id, documentId),
      ),
    );
  if (!document) return null;
  const object = await storage.get(document.storageKey);
  return object ? { ...object, ...document } : null;
}

/** The storage keys of a song's documents: deleting the song deletes their files (#238). */
export async function documentKeys(tx: Tx, bandId: string, songId: string) {
  const rows = await tx
    .select({ key: songDocuments.storageKey })
    .from(songDocuments)
    .where(and(eq(songDocuments.bandId, bandId), eq(songDocuments.songId, songId)));
  return rows.map((row) => row.key);
}

/** No document points to it any more: a failed delete only leaves an orphan file behind. */
export async function deleteQuietly({ storage, log }: Pick<Deps, "storage" | "log">, key: string) {
  try {
    await storage.delete(key);
  } catch (error) {
    log.warn("Document file not deleted", { key, err: error });
  }
}
