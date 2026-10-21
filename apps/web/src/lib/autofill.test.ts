import { expect, test } from "bun:test";
import { type Autofill, autofillChoices } from "./autofill";

const video = (id: string, duration: number | null) => ({
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: "Zombie",
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
    videos: [video("Zombie0Topi", 306), video("Zombie0Clip", 300)],
  };
  expect(autofillChoices(result, "Zombie0Clip")).toEqual({
    standardDuration: 307,
    style: "Rock",
    links: [
      { url: "https://www.youtube.com/watch?v=Zombie0Clip", title: null, instruments: [] },
      { url: "https://www.deezer.com/track/2", title: null, instruments: [] },
    ],
  });
});

test("autofillChoices: the video's duration without Deezer; no video chosen, no video link", () => {
  const result: Autofill = { track: null, videos: [video("Zombie0Topi", 306)] };
  expect(autofillChoices(result, "Zombie0Topi")).toMatchObject({
    standardDuration: 306,
    style: null,
  });
  expect(autofillChoices({ track, videos: null }, null).links).toEqual([
    { url: track.url, title: null, instruments: [] },
  ]);
  expect(autofillChoices({ track: null, videos: [] }, null)).toEqual({
    standardDuration: null,
    style: null,
    links: [],
  });
});

test("autofillChoices: values over the song's limits are left out", () => {
  const long = { ...track, duration: 99 * 3600, genre: "x".repeat(500) };
  expect(autofillChoices({ track: long, videos: [] }, null)).toMatchObject({
    standardDuration: null,
    style: null,
  });
});
