import { expect, test } from "bun:test";
import { createDeezerCatalog, TRACK_MATCHES } from "./deezer";

const zombie = (id: number, title: string, artist = "The Cranberries") => ({
  id,
  title,
  link: `https://www.deezer.com/track/${id}`,
  duration: 306,
  artist: { name: artist },
  album: { id: 77, title: "No Need to Argue" },
});

/** A fake Deezer answering by path; remembers the URLs asked. */
function fakeDeezer(answers: Record<string, unknown>, status = 200) {
  const asked: URL[] = [];
  const fetch = async (url: URL) => {
    asked.push(url);
    const body = answers[url.pathname] ?? { error: { type: "DataException" } };
    return new Response(JSON.stringify(body), { status });
  };
  return { asked, catalog: createDeezerCatalog({ baseUrl: "https://deezer.test", fetch }) };
}

test("findTrack: the same title first; its album's genre", async () => {
  const { asked, catalog } = fakeDeezer({
    "/search": {
      data: [zombie(3, "Zombie", "Bad Wolves"), zombie(1, "Zombie (Live)"), zombie(2, "Zombie")],
    },
    "/album/77": { genres: { data: [{ name: "Rock" }, { name: "Pop" }] } },
  });
  expect(await catalog.findTrack({ title: "zombie", artist: "the cranberries" })).toEqual({
    url: "https://www.deezer.com/track/2",
    title: "Zombie",
    artist: "The Cranberries",
    album: "No Need to Argue",
    duration: 306,
    albumId: 77,
  });
  expect(asked[0]?.searchParams.get("q")).toBe("the cranberries zombie");
  expect(await catalog.albumGenre(77)).toBe("Rock");
});

test("findTrack: the same artist when no title matches; an album without genre", async () => {
  const { catalog } = fakeDeezer({
    "/search": { data: [zombie(3, "Zombie", "Bad Wolves"), zombie(1, "Zombie (Live)")] },
    "/album/77": { genres: { data: [] } },
  });
  expect(await catalog.findTrack({ title: "Zombie", artist: "The Cranberries" })).toMatchObject({
    title: "Zombie (Live)",
  });
  expect(await catalog.albumGenre(77)).toBeNull();
});

test("searchTracks (#220): Deezer's tracks for free text, in its order", async () => {
  const { asked, catalog } = fakeDeezer({
    "/search": { data: [zombie(1, "Zombie (Live)"), zombie(2, "Zombie")] },
  });
  expect((await catalog.searchTracks("zombie live")).map((t) => t.title)).toEqual([
    "Zombie (Live)",
    "Zombie",
  ]);
  expect(asked[0]?.searchParams.get("q")).toBe("zombie live");
  expect(asked[0]?.searchParams.get("limit")).toBe(String(TRACK_MATCHES));
  expect(await fakeDeezer({ "/search": { data: [] } }).catalog.searchTracks("x")).toEqual([]);
  expect(fakeDeezer({}).catalog.searchTracks("x")).rejects.toThrow("refused");
});

test("nothing found is null; Deezer refusing, down or answering something else throws", async () => {
  expect(await fakeDeezer({ "/search": { data: [] } }).catalog.findTrack(song)).toBeNull();
  expect(fakeDeezer({}).catalog.findTrack(song)).rejects.toThrow("refused");
  expect(fakeDeezer({}).catalog.albumGenre(77)).rejects.toThrow("refused");
  expect(fakeDeezer({ "/search": { data: [] } }, 503).catalog.findTrack(song)).rejects.toThrow(
    "503",
  );
  expect(fakeDeezer({ "/search": { tracks: [] } }).catalog.findTrack(song)).rejects.toThrow(
    "something else",
  );
  const down = createDeezerCatalog({
    baseUrl: "https://deezer.test",
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  expect(down.findTrack(song)).rejects.toThrow("ECONNREFUSED");
});

const song = { title: "Zombie", artist: "The Cranberries" };
