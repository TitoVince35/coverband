import { expect, test } from "bun:test";
import { createMemoryCatalog } from "../../adapters/deezer";
import { createMemoryVideoSearch } from "../../adapters/youtube";
import { createMemoryLogger } from "../../core/log";
import { autofill } from "./service";

const band = { slug: "the-band" };
const zombie = { title: "Zombie", artist: "The Cranberries" };
const track = {
  url: "https://www.deezer.com/track/2",
  title: "Zombie",
  artist: "The Cranberries",
  album: "No Need to Argue",
  duration: 306,
  genre: "Rock",
};

test("a service that fails is logged as an error and listed, the others still answer", async () => {
  const { log, entries } = createMemoryLogger();
  const catalog = createMemoryCatalog(track);
  const videos = createMemoryVideoSearch();
  videos.down = true;
  expect(await autofill({ catalog, videos }, log, band, zombie)).toEqual({
    track,
    videos: null,
    failed: ["youtube"],
  });
  expect(entries).toEqual([
    expect.objectContaining({
      level: "error",
      msg: "YouTube search failed",
      err: expect.objectContaining({ message: "YouTube is down" }),
    }),
  ]);
});

test("the album failing keeps Deezer's track, without its genre", async () => {
  const { log, entries } = createMemoryLogger();
  const catalog = createMemoryCatalog(track);
  catalog.albumGenre = async () => {
    throw new Error("Deezer refused");
  };
  expect(await autofill({ catalog }, log, band, zombie)).toEqual({
    track: { ...track, genre: null },
    videos: null,
    failed: ["deezer"],
  });
  expect(entries).toEqual([
    expect.objectContaining({ level: "error", msg: "Deezer album failed", albumId: 1 }),
  ]);
});

test("nothing found isn't an error", async () => {
  const { log, entries } = createMemoryLogger();
  const result = await autofill(
    { catalog: createMemoryCatalog(), videos: createMemoryVideoSearch() },
    log,
    band,
    zombie,
  );
  expect(result).toEqual({ track: null, videos: [], failed: [] });
  expect(entries).toEqual([]);
});
