import { describe, expect, test } from "bun:test";
import { type JournalEntry, journalSentence } from "./journal";

const entry = (fields: Partial<JournalEntry> & Pick<JournalEntry, "action">): JournalEntry => ({
  id: "1",
  createdAt: "2026-10-30T10:00:00Z",
  actorName: "Lea",
  ...fields,
});

describe("journalSentence", () => {
  test("who did what, with the song's current title", () => {
    expect(journalSentence(entry({ action: "band.created" }))).toBe("Lea created the band");
    expect(journalSentence(entry({ action: "song.added", song: "Zombie" }))).toBe(
      "Lea added “Zombie”",
    );
    expect(
      journalSentence(entry({ action: "song.status_changed", song: "Zombie", status: "ready" })),
    ).toBe("Lea marked “Zombie” as ready");
  });

  test("a deleted song, a deleted account", () => {
    expect(journalSentence(entry({ action: "song.deleted", song: null, actorName: null }))).toBe(
      "Someone deleted a song",
    );
  });

  test("the genre and logo say what changed", () => {
    expect(journalSentence(entry({ action: "band.genre_changed", genre: "Rock" }))).toBe(
      "Lea changed the genre to Rock",
    );
    expect(journalSentence(entry({ action: "band.genre_changed", genre: null }))).toBe(
      "Lea removed the genre",
    );
    expect(journalSentence(entry({ action: "band.logo_changed", logo: "removed" }))).toBe(
      "Lea removed the band's logo",
    );
  });

  test("an action without a sentence says its code", () => {
    expect(journalSentence(entry({ action: "user.impersonated" }))).toBe("Lea: user.impersonated");
  });
});
