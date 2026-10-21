import { expect, test } from "bun:test";
import { MEDIA_LIMITS } from "@coverband/shared";
import { type Autofill, autofillChoices } from "./autofill";

const video = (id: string, duration: number | null, title = "Zombie") => ({
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title,
  channel: "The Cranberries - Topic",
  duration,
  thumbnailUrl: `/api/bands/b/autofill/thumbnails/${id}`,
});
const track = {
  url: "https://www.deezer.com/track/2",
  title: "Zombie",
  artist: "The Cranberries",
  album: "No Need to Argue",
  duration: 307,
  genre: "Rock",
};

test("autofillChoices: Deezer's duration and genre, the chosen video and Deezer as links", () => {
  const result: Autofill = {
    track,
    videos: [video("Zombie0Topi", 306), video("Zombie0Clip", 300, "Zombie (Official Video)")],
    failed: [],
  };
  expect(autofillChoices(result, "Zombie0Clip")).toEqual({
    standardDuration: 307,
    style: "Rock",
    links: [
      {
        url: "https://www.youtube.com/watch?v=Zombie0Clip",
        title: "Zombie (Official Video)",
        instruments: [],
      },
      { url: "https://www.deezer.com/track/2", title: null, instruments: [] },
    ],
  });
});

test("autofillChoices: the video's duration without Deezer; no video chosen, no video link", () => {
  const result: Autofill = { track: null, videos: [video("Zombie0Topi", 306)], failed: [] };
  expect(autofillChoices(result, "Zombie0Topi")).toMatchObject({
    standardDuration: 306,
    style: null,
  });
  expect(autofillChoices({ track, videos: null, failed: [] }, null).links).toEqual([
    { url: track.url, title: null, instruments: [] },
  ]);
  expect(autofillChoices({ track: null, videos: [], failed: [] }, null)).toEqual({
    standardDuration: null,
    style: null,
    links: [],
  });
});

test("autofillChoices: values over the song's limits are left out", () => {
  const long = { ...track, duration: 99 * 3600, genre: "x".repeat(500) };
  expect(autofillChoices({ track: long, videos: [], failed: [] }, null)).toMatchObject({
    standardDuration: null,
    style: null,
  });
  // A video title longer than a link's is shortened.
  const titled = { track: null, videos: [video("Zombie0Topi", 306, "z".repeat(150))], failed: [] };
  const title = autofillChoices(titled, "Zombie0Topi").links[0]?.title ?? "";
  expect(title).toHaveLength(MEDIA_LIMITS.title);
  expect(title.endsWith("…")).toBe(true);
});
