import { describe, expect, test } from "bun:test";
import { createYoutubeSearch, parseIsoDuration, rankVideos, type Video } from "./youtube";

test("parseIsoDuration reads YouTube's durations in seconds", () => {
  expect(parseIsoDuration("PT4M7S")).toBe(247);
  expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
  expect(parseIsoDuration("PT45S")).toBe(45);
  expect(parseIsoDuration("P1DT1S")).toBe(86401);
  expect(parseIsoDuration("P0D")).toBe(0);
  expect(parseIsoDuration("PT")).toBeNull();
  expect(parseIsoDuration("4:07")).toBeNull();
  expect(parseIsoDuration(undefined)).toBeNull();
});

const video = (id: string, title: string, channel: string, description = ""): Video => ({
  id: id.padEnd(11, "x"),
  title,
  channel,
  duration: 306,
  description,
});
const zombie = { title: "Zombie", artist: "The Cranberries" };

describe("rankVideos", () => {
  test("the album track first, then the artist's channel; other versions last", () => {
    const ranked = rankVideos(
      [
        video("live", "The Cranberries - Zombie (Live at Woodstock)", "The Cranberries"),
        video("cover", "Zombie - Cover by Bad Wolves", "Bad Wolves"),
        video("clip", "The Cranberries - Zombie (Official Music Video)", "TheCranberriesVEVO"),
        video("lyrics", "Zombie - The Cranberries (Lyrics)", "Lyrics Channel"),
        video("topic", "Zombie", "The Cranberries - Topic", "Provided to YouTube by Island"),
        video("other", "Zombie", "Some fan"),
      ],
      zombie,
    );
    expect(ranked.map((v) => v.id.replace(/x+$/, ""))).toEqual([
      "topic",
      "clip",
      "other",
      "live",
      "cover",
    ]);
  });

  test("a version the song's title asks for isn't pushed down", () => {
    const ranked = rankVideos(
      [
        video("studio", "Creep", "Radiohead - Topic"),
        video("acoustic", "Radiohead - Creep (Acoustic)", "Radiohead"),
      ],
      { title: "Creep (Acoustic)", artist: "Radiohead" },
    );
    expect(ranked[0]?.id).toStartWith("acoustic");
  });

  test("five at most, YouTube's order between equals", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((id) => video(id, "Zombie", "Fan"));
    expect(rankVideos(many, zombie).map((v) => v.id[0])).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("createYoutubeSearch", () => {
  /** A fake YouTube answering by path; remembers the URLs asked. */
  function fakeYoutube(answers: Record<string, unknown>, status = 200) {
    const asked: URL[] = [];
    const fetch = async (url: URL) => {
      asked.push(url);
      if (url.pathname.startsWith("/vi/")) {
        return new Response("jpeg bytes", { headers: { "content-type": "image/jpeg" } });
      }
      return Response.json(answers[url.pathname] ?? {}, { status });
    };
    const search = createYoutubeSearch({
      apiKey: "the-key",
      baseUrl: "https://youtube.test/youtube/v3",
      thumbnailsUrl: "https://img.test",
      fetch,
    });
    return { asked, search };
  }

  test("searches music videos, then their details, in the search's order", async () => {
    const { asked, search } = fakeYoutube({
      "/youtube/v3/search": {
        items: [
          { id: { videoId: "6Ejga4kJUts" } },
          { id: { videoId: "not a video id" } },
          { id: { videoId: "Zombie00002" } },
        ],
      },
      "/youtube/v3/videos": {
        items: [
          {
            id: "Zombie00002",
            snippet: { title: "Zombie", channelTitle: "The Cranberries - Topic", description: "" },
            contentDetails: { duration: "PT5M7S" },
          },
          {
            id: "6Ejga4kJUts",
            snippet: {
              title: "The Cranberries - Zombie (Official Music Video)",
              channelTitle: "TheCranberriesVEVO",
              description: "Don&#39;t miss it",
            },
            contentDetails: { duration: "PT5M6S" },
          },
        ],
      },
    });
    const videos = await search.search(zombie);
    expect(videos.map((v) => [v.id, v.duration])).toEqual([
      ["6Ejga4kJUts", 306],
      ["Zombie00002", 307],
    ]);
    const [searched, detailed] = asked;
    expect(searched?.searchParams.get("q")).toBe("The Cranberries Zombie");
    expect(searched?.searchParams.get("videoCategoryId")).toBe("10");
    expect(searched?.searchParams.get("key")).toBe("the-key");
    expect(detailed?.searchParams.get("id")).toBe("6Ejga4kJUts,Zombie00002");
  });

  test("titles are unescaped; YouTube refusing throws (the route shows no videos)", async () => {
    const { search } = fakeYoutube({
      "/youtube/v3/search": { items: [{ id: { videoId: "6Ejga4kJUts" } }] },
      "/youtube/v3/videos": {
        items: [{ id: "6Ejga4kJUts", snippet: { title: "Don&#39;t Stop &amp; Go" } }],
      },
    });
    expect((await search.search(zombie))[0]?.title).toBe("Don't Stop & Go");
    expect(fakeYoutube({}, 403).search.search(zombie)).rejects.toThrow("403");
  });

  test("thumbnails from YouTube's image servers, checked ids only", async () => {
    const { asked, search } = fakeYoutube({});
    const image = await search.thumbnail("6Ejga4kJUts");
    expect(image?.type).toBe("image/jpeg");
    expect(asked.at(-1)?.href).toBe("https://img.test/vi/6Ejga4kJUts/mqdefault.jpg");
    expect(await search.thumbnail("../../secret")).toBeNull();
  });
});
