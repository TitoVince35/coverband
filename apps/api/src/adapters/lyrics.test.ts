import { describe, expect, test } from "bun:test";
import { createLrclibProvider } from "./lyrics";

const entry = {
  id: 7,
  trackName: "The Only Mistake",
  artistName: "Joy Division",
  albumName: "Still",
  duration: 258.13,
  instrumental: false,
  plainLyrics: "Waiting at the window",
};

/** A fake LRCLIB answering in turn with each of these (a status, or an error to throw). */
function lrclib(...answers: (number | Error)[]) {
  const urls: string[] = [];
  const fetch = async (url: URL) => {
    urls.push(url.toString());
    const answer = answers.shift() ?? 200;
    if (answer instanceof Error) throw answer;
    return answer === 200
      ? Response.json([entry])
      : Response.json({ name: "ServerOverloaded" }, { status: answer });
  };
  const provider = createLrclibProvider({
    userAgent: "test",
    baseUrl: "https://lrclib.test/proxy",
    retryDelaysMs: [1, 1],
    fetch,
  });
  return { provider, urls };
}

const song = { title: "The only mistake", artist: "Joy Division" };

describe("LRCLIB", () => {
  test("searches by title and artist, keeping the base URL's path", async () => {
    const { provider, urls } = lrclib(200);
    expect(await provider.search(song)).toEqual([
      {
        id: "7",
        title: "The Only Mistake",
        artist: "Joy Division",
        album: "Still",
        duration: 258,
        lyrics: "Waiting at the window",
        instrumental: false,
      },
    ]);
    expect(urls).toEqual([
      "https://lrclib.test/proxy/api/search?track_name=The+only+mistake&artist_name=Joy+Division",
    ]);
  });

  test("an instrumental has no lyrics, whatever text comes with it", async () => {
    const fetch = async () =>
      Response.json([
        { ...entry, instrumental: true },
        { ...entry, id: 8, plainLyrics: "" },
      ]);
    const provider = createLrclibProvider({ userAgent: "test", fetch });
    expect(await provider.search(song)).toMatchObject([
      { id: "7", instrumental: true, lyrics: null },
      { id: "8", instrumental: false, lyrics: null },
    ]);
  });

  test("busy or unreachable: asked again, twice", async () => {
    const busy = lrclib(503, new Error("network"), 200);
    expect(await busy.provider.search(song)).toHaveLength(1);
    expect(busy.urls).toHaveLength(3);

    const down = lrclib(503, 503, 503);
    // The cause is kept, for the log (#208).
    expect(down.provider.search(song)).rejects.toMatchObject({
      code: "lyrics_unavailable",
      cause: expect.objectContaining({ message: "LRCLIB answered 503" }),
    });
  });

  test("a refusal that isn't about load is not asked again", async () => {
    const { provider, urls } = lrclib(400, 200);
    expect(provider.search(song)).rejects.toMatchObject({ code: "lyrics_unavailable" });
    await Bun.sleep(5);
    expect(urls).toHaveLength(1);
  });
});
