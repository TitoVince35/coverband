import {
  type BandLogo,
  bandLogo,
  LOGO_MAX_BYTES,
  LOGO_THUMBNAIL_MAX_BYTES,
  type LogoBackground,
} from "@coverband/shared";
import { eq } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Tx } from "../../core/db/client";
import { bands } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { ImageTooLargeError, InvalidImageError, imageType } from "../../core/images";
import type { AppDeps } from "../../deps";
import type { Band } from "./service";

type Deps = Pick<AppDeps, "db" | "storage" | "log">;

/**
 * Formats a logo comes in: PNG and WebP keep a transparent background (Safari can't encode WebP
 * from a canvas: it sends PNG), JPEG for photos.
 */
const LOGO_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;

/** Largest upload request: both files plus the multipart framing. */
export const LOGO_UPLOAD_MAX_SIZE = LOGO_MAX_BYTES + LOGO_THUMBNAIL_MAX_BYTES + 64 * 1024;

/**
 * A storage key this server wrote for this band's logo, or null: another value is never read or
 * deleted.
 */
export function ownLogoKey(bandId: string, key: string | null | undefined): string | null {
  const pattern = new RegExp(`^bands/${bandId}/logo/[0-9a-f-]{36}(-thumbnail)?\\.(png|webp|jpg)$`);
  return key && pattern.test(key) ? key : null;
}

type LogoColumns = Pick<Band, "id" | "slug" | "logoKey" | "logoThumbnailKey" | "logoBackground">;

/** The band's logo as the API returns it (versioned URLs and background), or null. */
export function logoOf(band: LogoColumns): BandLogo | null {
  return bandLogo(
    band.slug,
    {
      logo: ownLogoKey(band.id, band.logoKey),
      thumbnail: ownLogoKey(band.id, band.logoThumbnailKey),
    },
    band.logoBackground,
  );
}

/** Locks the band's row and returns its current logo keys. */
async function lockLogo(tx: Tx, bandId: string) {
  const [band] = await tx
    .select({ logoKey: bands.logoKey, logoThumbnailKey: bands.logoThumbnailKey })
    .from(bands)
    .where(eq(bands.id, bandId))
    .for("update");
  return {
    logo: ownLogoKey(bandId, band?.logoKey),
    thumbnail: ownLogoKey(bandId, band?.logoThumbnailKey),
  };
}

/** Checks one file: an accepted format, under its size limit. */
function checkImage(bytes: Uint8Array, maxBytes: number) {
  if (bytes.length > maxBytes) throw new ImageTooLargeError(maxBytes);
  const format = imageType(bytes, LOGO_TYPES);
  if (!format) throw new InvalidImageError(LOGO_TYPES);
  return format;
}

/**
 * Replaces the band's logo with these files, prepared by the browser (the logo fitted within
 * LOGO_SIZE, never cropped, and its thumbnail). New keys, so their URLs change and caches stay
 * valid; the previous files are deleted once the band points to the new ones.
 */
export async function setLogo(
  { db, storage, log }: Deps,
  band: Pick<Band, "id" | "slug">,
  actorId: string,
  upload: { logo: Uint8Array; thumbnail: Uint8Array; background: LogoBackground },
): Promise<BandLogo> {
  const logo = checkImage(upload.logo, LOGO_MAX_BYTES);
  const thumbnail = checkImage(upload.thumbnail, LOGO_THUMBNAIL_MAX_BYTES);
  const version = crypto.randomUUID();
  const keys = {
    logo: `bands/${band.id}/logo/${version}.${logo.extension}`,
    thumbnail: `bands/${band.id}/logo/${version}-thumbnail.${thumbnail.extension}`,
  };
  await storage.put(keys.logo, upload.logo, logo.type);
  let previous: { logo: string | null; thumbnail: string | null };
  try {
    await storage.put(keys.thumbnail, upload.thumbnail, thumbnail.type);
    previous = await db.transaction(async (tx) => {
      const current = await lockLogo(tx, band.id);
      await tx
        .update(bands)
        .set({
          logoKey: keys.logo,
          logoThumbnailKey: keys.thumbnail,
          logoBackground: upload.background,
        })
        .where(eq(bands.id, band.id));
      await recordActivity(tx, {
        action: "band.logo_changed",
        bandId: band.id,
        actorId,
        target: { type: "band", id: band.id },
        data: { change: current.logo ? "replaced" : "added", background: upload.background },
      });
      return current;
    });
  } catch (error) {
    await Promise.all([storage.delete(keys.logo), storage.delete(keys.thumbnail)]);
    throw error;
  }
  await deleteQuietly({ db, storage, log }, previous);
  return bandLogo(band.slug, keys, upload.background) as BandLogo;
}

export class NoLogoError extends AppError {
  constructor() {
    super("not_found", "The band has no logo");
  }
}

/** Changes the background the band's logo is shown on. */
export function setLogoBackground(
  { db }: Deps,
  band: Pick<Band, "id" | "slug">,
  actorId: string,
  background: LogoBackground,
): Promise<BandLogo> {
  return db.transaction(async (tx) => {
    const keys = await lockLogo(tx, band.id);
    if (!keys.logo || !keys.thumbnail) throw new NoLogoError();
    await tx.update(bands).set({ logoBackground: background }).where(eq(bands.id, band.id));
    await recordActivity(tx, {
      action: "band.logo_changed",
      bandId: band.id,
      actorId,
      target: { type: "band", id: band.id },
      data: { change: "background", background },
    });
    return bandLogo(band.slug, keys, background) as BandLogo;
  });
}

/** Removes the band's logo: its initials show again. Nothing to do without one. */
export async function removeLogo(deps: Deps, bandId: string, actorId: string) {
  const previous = await deps.db.transaction(async (tx) => {
    const current = await lockLogo(tx, bandId);
    if (!current.logo && !current.thumbnail) return current;
    await tx
      .update(bands)
      .set({ logoKey: null, logoThumbnailKey: null })
      .where(eq(bands.id, bandId));
    await recordActivity(tx, {
      action: "band.logo_changed",
      bandId,
      actorId,
      target: { type: "band", id: bandId },
      data: { change: "removed" },
    });
    return current;
  });
  await deleteQuietly(deps, previous);
}

/** The band no longer points to them: a failed delete only leaves orphan files behind. */
async function deleteQuietly(
  { storage, log }: Deps,
  keys: { logo: string | null; thumbnail: string | null },
) {
  for (const key of [keys.logo, keys.thumbnail]) {
    if (!key) continue;
    try {
      await storage.delete(key);
    } catch (error) {
      log.warn("Old band logo not deleted", { key, err: error });
    }
  }
}

/** The logo's file (or its thumbnail's) with its current URL, or null without one. */
export async function readLogo({ storage }: Deps, band: LogoColumns, file: "logo" | "thumbnail") {
  const logo = logoOf(band);
  const key = file === "logo" ? band.logoKey : band.logoThumbnailKey;
  if (!logo || !key) return null;
  const object = await storage.get(key);
  return object ? { ...object, url: file === "logo" ? logo.url : logo.thumbnailUrl } : null;
}
