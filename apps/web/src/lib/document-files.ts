import { DOCUMENT_EXTENSIONS, DOCUMENT_LIMITS } from "@coverband/shared";
import { fitWithin, sizesFrom } from "@/lib/logo";

// A document's file before upload (#239): what the picker offers, the photos shrunk. No API here,
// so it is tested without a browser.

/** What the file picker offers: photos (HEIC too: converted) and the files of the four kinds. */
export const DOCUMENT_ACCEPT = [
  "image/*",
  ...Object.values(DOCUMENT_EXTENSIONS)
    .flat()
    .map((extension) => `.${extension}`),
].join(",");

/** A photo of a chord grid stays readable at this size, and small (the storage budget, #239). */
export const PHOTO_SIZE = 1600;

/** Photos are encoded until they are this small, at most; the server's limit is far above it. */
export const PHOTO_MAX_BYTES = 600_000;

/** A photo, shrunk before upload; never an SVG (the API refuses it) nor a GIF. */
export function isPhoto(file: { type: string }) {
  return file.type.startsWith("image/") && !["image/svg+xml", "image/gif"].includes(file.type);
}

/** The title a picked file suggests: its name without its extension, tidied ("horns_part" → "horns part"). */
export function titleFrom(fileName: string) {
  const name = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.slice(0, DOCUMENT_LIMITS.title);
}

/**
 * A photo shrunk as hard as reading allows (#239): within PHOTO_SIZE, then smaller sizes until it
 * fits PHOTO_MAX_BYTES; WebP, else JPEG (Safari can't encode WebP). The EXIF orientation is
 * applied; HEIC is converted where the browser reads it. Throws when it can't read the image.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    let smallest: Blob | null = null;
    for (const size of sizesFrom(PHOTO_SIZE)) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, size);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No canvas");
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      for (const type of ["image/webp", "image/jpeg"] as const) {
        const blob = await encode(canvas, type, 0.7);
        // A browser that can't encode the type gives PNG: tried next anyway.
        if (blob.type !== type) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= PHOTO_MAX_BYTES) return asFile(blob, file.name);
      }
    }
    if (!smallest) throw new Error("Encoding failed");
    return asFile(smallest, file.name);
  } finally {
    bitmap.close();
  }
}

function asFile(blob: Blob, name: string) {
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      type,
      quality,
    ),
  );
}
