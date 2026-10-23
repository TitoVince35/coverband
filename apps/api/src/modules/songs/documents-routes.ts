import { DOCUMENT_LIMITS, opensInApp } from "@coverband/shared";
import { addDocumentBody, updateDocumentBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { addDocument, deleteDocument, readDocument, updateDocument } from "./documents.service";

/** Largest upload request: the file plus its title, instruments and the multipart framing. */
export const DOCUMENT_UPLOAD_MAX_SIZE = DOCUMENT_LIMITS.maxBytes + 64 * 1024;

const songParam = z.object({ songId: z.uuid() });
const documentParam = songParam.extend({ documentId: z.uuid() });

/**
 * A song's documents (#238), under /api/bands/:bandSlug/songs/:songId/documents: every member
 * adds them and edits their title and instruments; the member who added one, or the band leader,
 * deletes it. Listed with the song (songs routes).
 */
export function documentRoutes(deps: AppDeps) {
  const member = (c: Context<BandEnv>) => ({
    bandId: c.var.band.id,
    bandSlug: c.var.band.slug,
    userId: c.var.user.id,
  });

  return (
    new Hono<SessionEnv>()
      .use(requireMember(deps.db))
      // A multipart form: the file, its title and its instruments (JSON). The type is read from
      // the file's bytes and name, never its declared type.
      .post(
        "/",
        zValidator("param", songParam, validationHook),
        zValidator("form", addDocumentBody, validationHook),
        async (c) => {
          const { file, title, instruments } = c.req.valid("form");
          const document = await addDocument(
            { ...deps, log: c.var.log },
            member(c),
            c.req.valid("param").songId,
            {
              bytes: new Uint8Array(await file.arrayBuffer()),
              fileName: file.name,
              title,
              instruments,
            },
          );
          return document ? c.json({ document }, 201) : apiError(c, 404, "Song not found");
        },
      )
      .patch(
        "/:documentId",
        zValidator("param", documentParam, validationHook),
        zValidator("json", updateDocumentBody, validationHook),
        async (c) => {
          const { songId, documentId } = c.req.valid("param");
          const document = await updateDocument(
            deps.db,
            member(c),
            songId,
            documentId,
            c.req.valid("json"),
          );
          return document ? c.json({ document }) : apiError(c, 404, "Document not found");
        },
      )
      .delete("/:documentId", zValidator("param", documentParam, validationHook), async (c) => {
        const { songId, documentId } = c.req.valid("param");
        const deleted = await deleteDocument(
          { ...deps, log: c.var.log },
          { ...member(c), isLeader: c.var.membership.role === "leader" },
          songId,
          documentId,
        );
        return deleted ? c.body(null, 204) : apiError(c, 404, "Document not found");
      })
      // The file: photos and PDFs shown, the others downloaded. Never replaced: cached for good.
      .get("/:documentId/file", zValidator("param", documentParam, validationHook), async (c) => {
        const { songId, documentId } = c.req.valid("param");
        const document = await readDocument(deps, c.var.band.id, songId, documentId);
        if (!document) return apiError(c, 404, "Document not found");
        const disposition = opensInApp(document.kind) ? "inline" : "attachment";
        return c.body(document.body, 200, {
          "content-type": document.type,
          "content-length": String(document.size),
          "content-disposition": `${disposition}; ${fileName(document.title, document.extension)}`,
          "cache-control": "private, max-age=31536000, immutable",
        });
      })
  );
}

/** The download's name, the document's title: plain ASCII, and its UTF-8 form (RFC 6266). */
export function fileName(title: string, extension: string) {
  const name = `${title}.${extension}`;
  const ascii =
    name
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "") || "document";
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
