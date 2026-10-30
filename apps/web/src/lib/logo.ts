import {
  LOGO_MAX_BYTES,
  LOGO_SIZE,
  LOGO_THUMBNAIL_MAX_BYTES,
  LOGO_THUMBNAIL_SIZE,
} from "@coverband/shared";
import { type DecodedImage, decodeImage } from "@/lib/decode-image";

/** The size of a width × height image fitted within max × max: never cropped, never upscaled. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Each size tried in turn, from the largest, until the file fits under its limit. */
export function sizesFrom(max: number) {
  return [max, Math.round(max * 0.75), Math.round(max * 0.5)];
}

type Encoding = { type: "image/webp" | "image/png" | "image/jpeg"; quality?: number };

/**
 * Formats tried in turn: WebP keeps transparency and stays small (Safari can't encode it and
 * falls back to PNG, which the browser gives instead); PNG keeps transparency without loss; JPEG
 * only for an image without transparency (it would turn transparent areas black).
 */
export function encodingsFor(opaque: boolean): Encoding[] {
  return [
    { type: "image/webp", quality: 0.9 },
    { type: "image/png" },
    ...(opaque ? [{ type: "image/jpeg", quality: 0.9 } as const] : []),
  ];
}

/** Whether any pixel of the image is (even partly) transparent. */
function isOpaque(image: DecodedImage) {
  // A small copy is enough to find transparent areas, and quick.
  const { width, height } = fitWithin(image.width, image.height, 128);
  const context = canvasOf(width, height);
  context.drawImage(image.source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  for (let alpha = 3; alpha < data.length; alpha += 4) {
    if ((data[alpha] ?? 255) < 255) return false;
  }
  return true;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  return context;
}

/** The image fitted within `max`, in the first format and size that fits under `maxBytes`. */
async function fitted(image: DecodedImage, max: number, maxBytes: number, opaque: boolean) {
  for (const size of sizesFrom(max)) {
    const { width, height } = fitWithin(image.width, image.height, size);
    const context = canvasOf(width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, 0, 0, width, height);
    for (const { type, quality } of encodingsFor(opaque)) {
      const blob = await encode(context.canvas, type, quality);
      // A browser that can't encode the type gives PNG: tried next anyway.
      if (blob.type === type && blob.size <= maxBytes) return blob;
    }
  }
  throw new LogoTooLargeError();
}

export class LogoTooLargeError extends Error {
  constructor() {
    super("Logo too large even when reduced");
  }
}

/**
 * Turns a picked file into a band logo (#176): the whole image fitted within LOGO_SIZE (enough
 * to print it, never cropped), and its LOGO_THUMBNAIL_SIZE thumbnail for the band list, each
 * under its upload limit and keeping transparency. Throws for files the browser can't read as an
 * image, and LogoTooLargeError when nothing fits.
 */
export async function prepareLogo(file: File): Promise<{ logo: Blob; thumbnail: Blob }> {
  // A phone's JPEG decoded already reduced (#257), still above LOGO_SIZE: never the full photo.
  const image = await decodeImage(file, LOGO_SIZE * 1.5);
  try {
    const opaque = isOpaque(image);
    return {
      logo: await fitted(image, LOGO_SIZE, LOGO_MAX_BYTES, opaque),
      thumbnail: await fitted(image, LOGO_THUMBNAIL_SIZE, LOGO_THUMBNAIL_MAX_BYTES, opaque),
    };
  } finally {
    image.close();
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      type,
      quality,
    ),
  );
}
