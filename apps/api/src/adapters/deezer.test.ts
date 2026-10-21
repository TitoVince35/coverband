import { expect, test } from "bun:test";
import { createDeezerCatalog } from "./deezer";

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

test("findTrack: the same title first, with its album's genre", async () => {
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
    genre: "Rock",
  });
  expect(asked[0]?.searchParams.get("q")).toBe("the cranberries zombie");
});

test("findTrack: the same artist when no title matches; no genre is still a match", async () => {
  const { catalog } = fakeDeezer({
    "/search": { data: [zombie(3, "Zombie", "Bad Wolves"), zombie(1, "Zombie (Live)")] },
  });
  expect(await catalog.findTrack({ title: "Zombie", artist: "The Cranberries" })).toMatchObject({
    title: "Zombie (Live)",
    genre: null,
  });
});

test("findTrack: nothing found, Deezer refusing or down is no match, never an error", async () => {
  expect(await fakeDeezer({ "/search": { data: [] } }).catalog.findTrack(song)).toBeNull();
  expect(await fakeDeezer({}).catalog.findTrack(song)).toBeNull();
  expect(await fakeDeezer({ "/search": { data: [] } }, 503).catalog.findTrack(song)).toBeNull();
  const down = createDeezerCatalog({
    baseUrl: "https://deezer.test",
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  expect(await down.findTrack(song)).toBeNull();
});

const song = { title: "Zombie", artist: "The Cranberries" };
