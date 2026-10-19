import { describe, expect, test } from "bun:test";
import { findDuplicateSong, songKey } from "./songs";

describe("songKey", () => {
  test("ignores case, accents, punctuation and extra spaces", () => {
    expect(songKey({ title: "  Café   del Mar ", artist: "ENERGY 52" })).toBe(
      songKey({ title: "cafe del mar", artist: "Energy-52" }),
    );
  });

  test("keeps different words different", () => {
    expect(songKey({ title: "Help!", artist: "Beatles" })).not.toBe(
      songKey({ title: "Help!", artist: "The Beatles" }),
    );
    expect(songKey({ title: "Creep (acoustic)", artist: "Radiohead" })).not.toBe(
      songKey({ title: "Creep", artist: "Radiohead" }),
    );
  });
});

describe("findDuplicateSong", () => {
  const songs = [
    { id: "1", title: "Creep", artist: "Radiohead" },
    { id: "2", title: "Help!", artist: "The Beatles" },
  ];

  test("finds the song with the same title and artist", () => {
    expect(findDuplicateSong(songs, { title: "creep", artist: "radiohead" })?.id).toBe("1");
    expect(findDuplicateSong(songs, { title: "Creep", artist: "Stone Temple Pilots" })).toBe(
      undefined,
    );
  });

  test("a song being edited doesn't duplicate itself", () => {
    expect(findDuplicateSong(songs, { title: "Creep", artist: "Radiohead" }, "1")).toBe(undefined);
    expect(findDuplicateSong(songs, { title: "Creep", artist: "Radiohead" }, "2")?.id).toBe("1");
  });
});
