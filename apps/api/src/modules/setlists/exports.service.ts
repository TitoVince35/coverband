import type { SetlistExportFormat } from "@coverband/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import type { StoredObject } from "../../adapters/storage";
import { setlistExports } from "../../core/db/schema";
import type { AppDeps } from "../../deps";
import { type Band, bandLogoKey } from "../bands/service";
import { type ExportLogo, renderDocx } from "./docx";
import {
  type ExportDocument,
  type ExportOptions,
  exportDate,
  exportDocument,
  exportFingerprint,
} from "./export-document";
import { deleteExportFiles, getSetlist, setlistContent } from "./service";

type Deps = Pick<AppDeps, "db" | "storage" | "log">;

/** Each format's file: its media type and extension. */
export const EXPORT_FILES: Record<SetlistExportFormat, { type: string; extension: string }> = {
  docx: {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
};

/** A setlist's export, ready to be served or made. */
export type PreparedExport = {
  bandId: string;
  setlistId: string;
  format: SetlistExportFormat;
  options: ExportOptions;
  document: ExportDocument;
  fingerprint: string;
};

/**
 * What the export of a band's setlist shows, with its fingerprint and the stored file when it
 * still shows exactly that; null when the band has no such setlist.
 */
export async function findExport(
  { db, storage }: Deps,
  band: Pick<Band, "id" | "name" | "logoKey">,
  setlistId: string,
  format: SetlistExportFormat,
  options: ExportOptions,
): Promise<{ prepared: PreparedExport; cached: StoredObject | null } | null> {
  const setlist = await getSetlist(db, band.id, setlistId);
  if (!setlist) return null;
  const document = exportDocument(
    {
      title: setlist.title,
      updatedAt: setlist.updatedAt,
      band: { name: band.name, logoKey: bandLogoKey(band) },
      parts: await setlistContent(db, band.id, setlistId),
    },
    options,
  );
  const prepared = {
    bandId: band.id,
    setlistId,
    format,
    options,
    document,
    fingerprint: exportFingerprint(document, format),
  };
  const [row] = await db
    .select({ fingerprint: setlistExports.fingerprint, fileKey: setlistExports.fileKey })
    .from(setlistExports)
    .where(
      and(
        eq(setlistExports.setlistId, setlistId),
        eq(setlistExports.format, format),
        eq(setlistExports.language, options.language),
      ),
    );
  const cached = row?.fingerprint === prepared.fingerprint ? await storage.get(row.fileKey) : null;
  return { prepared, cached };
}

/** The band's logo as PNG (neither format holds WebP), or null when it has none or it's gone. */
async function loadLogo({ storage, log }: Deps, key: string | null): Promise<ExportLogo | null> {
  if (!key) return null;
  const stored = await storage.get(key);
  if (!stored) {
    log.warn("A band's logo is missing from the bucket", { key });
    return null;
  }
  const bytes = new Uint8Array(await new Response(stored.body).arrayBuffer());
  const { data, info } = await sharp(bytes).png().toBuffer({ resolveWithObject: true });
  return { png: new Uint8Array(data), width: info.width, height: info.height };
}

/** Makes a file of this format. */
async function render(deps: Deps, prepared: PreparedExport, now: Date) {
  const logo = await loadLogo(deps, prepared.document.logoKey);
  const generatedOn = exportDate(now, prepared.options);
  switch (prepared.format) {
    case "docx":
      return renderDocx(prepared.document, { logo, generatedOn });
  }
}

/**
 * Makes the file, stores it, and makes it the setlist's export for its format and language: the
 * file it replaces is deleted. Returns its bytes.
 */
export async function makeExport(deps: Deps, prepared: PreparedExport, now = new Date()) {
  const { db, storage } = deps;
  const { bandId, setlistId, format, options, fingerprint } = prepared;
  const bytes = await render(deps, prepared, now);
  const { type, extension } = EXPORT_FILES[format];
  const fileKey = `bands/${bandId}/setlists/${setlistId}/exports/${crypto.randomUUID()}.${extension}`;
  await storage.put(fileKey, bytes, type);
  let previous: string | null = null;
  try {
    previous = await db.transaction(async (tx) => {
      const [old] = await tx
        .select({ fileKey: setlistExports.fileKey })
        .from(setlistExports)
        .where(
          and(
            eq(setlistExports.setlistId, setlistId),
            eq(setlistExports.format, format),
            eq(setlistExports.language, options.language),
          ),
        )
        .for("update");
      await tx
        .insert(setlistExports)
        .values({
          bandId,
          setlistId,
          format,
          language: options.language,
          fingerprint,
          fileKey,
          size: bytes.length,
        })
        .onConflictDoUpdate({
          target: [setlistExports.setlistId, setlistExports.format, setlistExports.language],
          set: { fingerprint, fileKey, size: bytes.length, createdAt: now },
        });
      return old?.fileKey ?? null;
    });
  } catch (error) {
    // The setlist was deleted meanwhile, for instance: the new file is kept by nothing.
    await deleteExportFiles(deps, [fileKey]);
    throw error;
  }
  if (previous && previous !== fileKey) await deleteExportFiles(deps, [previous]);
  return bytes;
}
