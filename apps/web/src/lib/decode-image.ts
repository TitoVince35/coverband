/** A picked image, decoded: what to draw, its size as displayed (EXIF orientation applied). */
export type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
};

/**
 * Decodes a picked image (#257) at most about `side` × `side` pixels when it is a JPEG: Chrome's
 * ImageDecoder scales JPEGs while decoding (in eighths, the decoded area staying under the one
 * asked, proportions kept), so a phone's 50-megapixel photo never takes hundreds of MB, which made
 * Android kill the page. `createImageBitmap` can't: with or without `resizeWidth`, it decodes the
 * whole image first. Elsewhere (Safari, PNG, WebP, a Chrome drawing frames without their EXIF
 * rotation), the whole image, with `createImageBitmap`. Throws for what the browser can't read.
 */
export async function decodeImage(file: File, side: number): Promise<DecodedImage> {
  if (file.type === "image/jpeg" && (await scalesJpeg())) {
    const decoder = new ImageDecoder({
      data: file.stream(),
      type: file.type,
      desiredWidth: side,
      desiredHeight: side,
    });
    try {
      const { image } = await decoder.decode();
      return {
        source: image,
        width: image.displayWidth,
        height: image.displayHeight,
        close: () => image.close(),
      };
    } finally {
      decoder.close();
    }
  }
  const bitmap = await createImageBitmap(file); // applies the photo's EXIF orientation
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

/** ImageDecoder decodes JPEGs, and canvases draw its frames turned as their EXIF says. */
async function scalesJpeg() {
  return (
    typeof ImageDecoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    "rotation" in VideoFrame.prototype &&
    (await ImageDecoder.isTypeSupported("image/jpeg"))
  );
}
