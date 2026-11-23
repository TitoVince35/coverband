// A venue's map (#333) from OpenStreetMap's tiles, without a map library: Web Mercator maths, the
// tiles that cover a box around a point, and back from a dragged pin to coordinates.

/** A tile's side, in pixels. */
export const TILE_SIZE = 256;

/** How close the map is: a street and its neighbours. */
export const MAP_ZOOM = 16;

/** OpenStreetMap's tiles (their usage policy: credited, a Referer, no heavy use). */
export const tileUrl = (x: number, y: number, zoom: number) =>
  `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

/** A point's position on the whole world's map at `zoom`, in pixels from its top left. */
export function toPixels(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** The coordinates of a position on the whole world's map at `zoom`. */
export function toCoordinates(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return {
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    longitude: (x / scale) * 360 - 180,
  };
}

/**
 * The tiles covering a `width` × `height` box centred on a point, each with where it goes in the
 * box (`left`, `top`, in pixels).
 */
export function tilesAround(
  center: { latitude: number; longitude: number },
  width: number,
  height: number,
  zoom = MAP_ZOOM,
) {
  const { x, y } = toPixels(center.latitude, center.longitude, zoom);
  const left = x - width / 2;
  const top = y - height / 2;
  const count = 2 ** zoom;
  const tiles: { x: number; y: number; left: number; top: number; url: string }[] = [];
  for (let ty = Math.floor(top / TILE_SIZE); ty * TILE_SIZE < top + height; ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(left / TILE_SIZE); tx * TILE_SIZE < left + width; tx++) {
      // Around the world sideways.
      const wrapped = ((tx % count) + count) % count;
      tiles.push({
        x: wrapped,
        y: ty,
        left: tx * TILE_SIZE - left,
        top: ty * TILE_SIZE - top,
        url: tileUrl(wrapped, ty, zoom),
      });
    }
  }
  return tiles;
}

/** A point moved by some pixels on the map at `zoom` (a dragged pin). */
export function moved(
  point: { latitude: number; longitude: number },
  dx: number,
  dy: number,
  zoom = MAP_ZOOM,
) {
  const { x, y } = toPixels(point.latitude, point.longitude, zoom);
  return toCoordinates(x + dx, y + dy, zoom);
}
