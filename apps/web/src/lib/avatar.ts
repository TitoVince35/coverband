import { AVATAR_SIZE } from "@coverband/shared";

/** Stays under the API's 100 KB body limit with some margin. */
const MAX_BYTES = 95_000;

/** The centered square of a width × height image, and the size it is drawn at (never upscaled). */
export function centeredSquare(width: number, height: number, max = AVATAR_SIZE) {
  const side = Math.min(width, height);
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) / 2),
    side,
    size: Math.min(side, max),
  };
}

/**
 * Turns a picked photo into an avatar: centered square crop, at most 512 px, WebP (JPEG where the
 * browser can't encode WebP, like Safari), under the upload limit. Throws for files the browser
 * can't read as an image.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // applies the photo's EXIF orientation
  const { sx, sy, side, size } = centeredSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.5]) {
    let blob = await encode(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("Image too large even when compressed");
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
