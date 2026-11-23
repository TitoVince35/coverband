import { describe, expect, test } from "bun:test";
import { moved, TILE_SIZE, tilesAround, toCoordinates, toPixels } from "./map-tiles";

const rennes = { latitude: 48.1137, longitude: -1.6801 };

describe("map tiles (#333)", () => {
  test("Web Mercator both ways", () => {
    expect(toPixels(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const { x, y } = toPixels(rennes.latitude, rennes.longitude, 16);
    const back = toCoordinates(x, y, 16);
    expect(back.latitude).toBeCloseTo(rennes.latitude, 6);
    expect(back.longitude).toBeCloseTo(rennes.longitude, 6);
  });

  test("the tiles covering a box around a point, placed in it", () => {
    const tiles = tilesAround(rennes, 300, 160, 16);
    // The tile holding Rennes's centre, at zoom 16.
    const { x, y } = toPixels(rennes.latitude, rennes.longitude, 16);
    const center = tiles.find(
      (tile) => tile.x === Math.floor(x / TILE_SIZE) && tile.y === Math.floor(y / TILE_SIZE),
    );
    expect(center?.url).toBe(
      `https://tile.openstreetmap.org/16/${Math.floor(x / TILE_SIZE)}/${Math.floor(y / TILE_SIZE)}.png`,
    );
    // Every tile touches the box; together they cover it.
    for (const tile of tiles) {
      expect(tile.left).toBeLessThan(300);
      expect(tile.left + TILE_SIZE).toBeGreaterThan(0);
      expect(tile.top).toBeLessThan(160);
      expect(tile.top + TILE_SIZE).toBeGreaterThan(0);
    }
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(tiles.length).toBeLessThanOrEqual(6);
  });

  test("a dragged pin: east and south by some pixels", () => {
    const next = moved(rennes, 100, 50, 16);
    expect(next.longitude).toBeGreaterThan(rennes.longitude);
    expect(next.latitude).toBeLessThan(rennes.latitude);
    expect(moved(rennes, 0, 0, 16).latitude).toBeCloseTo(rennes.latitude, 9);
  });
});
