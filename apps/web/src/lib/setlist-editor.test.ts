import { describe, expect, test } from "bun:test";
import { SETLIST_LIMITS } from "@coverband/shared";
import {
  addPart,
  addSongs,
  type Draft,
  type DraftSong,
  movePart,
  moveStep,
  moveTo,
  otherPlaces,
  removePart,
  removeSong,
  renamePart,
  songChoices,
  toContent,
  toDraft,
} from "./setlist-editor";

const song = (id: string, status: DraftSong["status"] = "ready"): DraftSong => ({
  id,
  title: `Title ${id}`,
  artist: "Artist",
  standardDuration: 200,
  ownDuration: null,
  status,
  energy: null,
  archivedAt: null,
});

/** Each part's song ids, to compare drafts. */
const ids = (draft: Draft) => draft.map((part) => part.songs.map((entry) => entry.song.id));
const keyOf = (draft: Draft, part: number, index: number) => draft[part]?.songs[index]?.key ?? "";

const draft = () =>
  toDraft([
    { name: "Set 1", songs: [song("a"), song("b"), song("c")] },
    { name: null, songs: [song("d")] },
  ]);

describe("the setlist editor's changes", () => {
  test("toDraft and toContent round-trip a setlist's content", () => {
    expect(toContent(draft())).toEqual([
      { name: "Set 1", songs: ["a", "b", "c"] },
      { name: null, songs: ["d"] },
    ]);
  });

  test("moveStep moves within a part, then across parts, never past the ends", () => {
    const d = draft();
    expect(ids(moveStep(d, keyOf(d, 0, 1), -1))).toEqual([["b", "a", "c"], ["d"]]);
    expect(ids(moveStep(d, keyOf(d, 0, 2), 1))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(ids(moveStep(d, keyOf(d, 1, 0), -1))).toEqual([["a", "b", "c", "d"], []]);
    expect(moveStep(d, keyOf(d, 0, 0), -1)).toBe(d);
    expect(moveStep(d, keyOf(d, 1, 0), 1)).toBe(d);
  });

  test("moveTo moves a song to another part, at its end or an index", () => {
    const d = draft();
    expect(ids(moveTo(d, keyOf(d, 0, 0), 1))).toEqual([
      ["b", "c"],
      ["d", "a"],
    ]);
    expect(ids(moveTo(d, keyOf(d, 0, 0), 1, 0))).toEqual([
      ["b", "c"],
      ["a", "d"],
    ]);
    expect(ids(moveTo(d, keyOf(d, 0, 0), 0, 2))).toEqual([["b", "c", "a"], ["d"]]);
  });

  test("removeSong removes one place only", () => {
    const d = addSongs(draft(), 1, [song("a")]);
    expect(ids(removeSong(d, keyOf(d, 1, 1)))).toEqual([["a", "b", "c"], ["d"]]);
  });

  test(`addSongs adds at a part's end, up to ${SETLIST_LIMITS.songs} songs`, () => {
    expect(ids(addSongs(draft(), 0, [song("e"), song("f")]))).toEqual([
      ["a", "b", "c", "e", "f"],
      ["d"],
    ]);
    const many = Array.from({ length: SETLIST_LIMITS.songs }, (_, i) => song(`s${i}`));
    const full = addSongs(draft(), 1, many);
    expect(full.reduce((total, part) => total + part.songs.length, 0)).toBe(SETLIST_LIMITS.songs);
  });

  test(`parts: added up to ${SETLIST_LIMITS.parts}, renamed, moved, removed but never the last`, () => {
    let d = draft();
    for (let i = 0; i < 10; i++) d = addPart(d);
    expect(d).toHaveLength(SETLIST_LIMITS.parts);
    expect(renamePart(draft(), 1, "  Encore ")[1]?.name).toBe("Encore");
    expect(renamePart(draft(), 0, "  ")[0]?.name).toBeNull();
    expect(ids(movePart(draft(), 1, -1))).toEqual([["d"], ["a", "b", "c"]]);
    expect(ids(removePart(draft(), 0))).toEqual([["d"]]);
    const one = toDraft([{ name: null, songs: [song("a")] }]);
    expect(removePart(one, 0)).toBe(one);
  });

  test("otherPlaces names the parts where a song also is", () => {
    const d = addSongs(addSongs(draft(), 1, [song("a")]), 0, [song("b")]);
    const others = otherPlaces(d);
    expect(others.get(keyOf(d, 0, 0))).toEqual([1]);
    expect(others.get(keyOf(d, 1, 1))).toEqual([0]);
    // Twice in its own part.
    expect(others.get(keyOf(d, 0, 1))).toEqual([0]);
    expect(others.has(keyOf(d, 0, 2))).toBe(false);
  });
});

describe("songChoices", () => {
  const songs = [
    { ...song("1"), title: "Zombie", artist: "The Cranberries" },
    { ...song("2", "learning"), title: "Linger", artist: "The Cranberries" },
    { ...song("3", "proposed"), title: "Creep", artist: "Radiohead" },
    { ...song("4"), title: "Mr. Brightside", artist: "The Killers" },
  ];

  test("ready songs by default, learning ones when asked, never proposed ones", () => {
    expect(songChoices(songs, { query: "", learning: false }).map((s) => s.title)).toEqual([
      "Zombie",
      "Mr. Brightside",
    ]);
    expect(songChoices(songs, { query: "", learning: true }).map((s) => s.title)).toEqual([
      "Zombie",
      "Linger",
      "Mr. Brightside",
    ]);
  });

  test("searches the title and the artist, accents and case ignored", () => {
    expect(
      songChoices(songs, { query: "cranberries", learning: true }).map((s) => s.title),
    ).toEqual(["Zombie", "Linger"]);
    expect(songChoices(songs, { query: "BRIGHTSIDE", learning: false })).toHaveLength(1);
  });
});
