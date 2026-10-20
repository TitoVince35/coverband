import { AppError } from "./errors";

/** Image formats the API stores, recognised by their first bytes (never the declared type). */
export const IMAGE_FORMATS = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export type ImageType = keyof typeof IMAGE_FORMATS;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The format of these bytes among `accepted`, or null (an SVG, a text file, another format). */
export function imageType(
  bytes: Uint8Array,
  accepted: readonly ImageType[],
): { type: ImageType; extension: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  let type: ImageType | null = null;
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") type = "image/webp";
  else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    type = "image/jpeg";
  } else if (bytes.length > 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    type = "image/png";
  }
  return type && accepted.includes(type) ? { type, extension: IMAGE_FORMATS[type] } : null;
}

export class InvalidImageError extends AppError {
  constructor(accepted: readonly ImageType[]) {
    super("invalid_image", `Not an image of these types: ${accepted.join(", ")}`);
  }
}

export class ImageTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super("image_too_large", `Image larger than ${maxBytes} bytes`);
  }
}
