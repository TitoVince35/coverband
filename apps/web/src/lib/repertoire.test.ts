import { describe, expect, test } from "bun:test";
import { repertoireView } from "./repertoire";

const songs = [
  { title: "Africa", artist: "Toto", status: "ready", energy: 2 },
  { title: "Café del Mar", artist: "Energy 52", status: "learning", energy: null },
  { title: "Creep", artist: "Radiohead", status: "ready", energy: 1 },
  { title: "Zombie", artist: "The Cranberries", status: "proposed", energy: 2 },
] as const;

const titles = (list: readonly { title: string }[]) => list.map((s) => s.title);

describe("repertoireView", () => {
  test("searches titles and artists, ignoring accents and case", () => {
    const view = (query: string) =>
      titles(repertoireView(songs, { query, status: "all", sort: "title" }));
    expect(view("")).toEqual(["Africa", "Café del Mar", "Creep", "Zombie"]);
    expect(view("CAFE")).toEqual(["Café del Mar"]);
    expect(view("cranberries")).toEqual(["Zombie"]);
  });

  test("filters on the status", () => {
    expect(titles(repertoireView(songs, { query: "", status: "ready", sort: "title" }))).toEqual([
      "Africa",
      "Creep",
    ]);
  });

  test("sorts by energy, hottest first, unrated last, then by title", () => {
    expect(titles(repertoireView(songs, { query: "", status: "all", sort: "energy" }))).toEqual([
      "Africa",
      "Zombie",
      "Creep",
      "Café del Mar",
    ]);
  });

  test("sorts in either direction (#218): unrated songs stay last", () => {
    const view = (sort: "title" | "energy", direction: "asc" | "desc") =>
      titles(repertoireView(songs, { query: "", status: "all", sort, direction }));
    expect(view("title", "desc")).toEqual(["Zombie", "Creep", "Café del Mar", "Africa"]);
    expect(view("energy", "asc")).toEqual(["Creep", "Africa", "Zombie", "Café del Mar"]);
    expect(view("energy", "desc")).toEqual(["Africa", "Zombie", "Creep", "Café del Mar"]);
  });
});
