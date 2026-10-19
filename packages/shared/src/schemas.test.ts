import { describe, expect, test } from "bun:test";
import { MAX_INSTRUMENTS } from "./instruments";
import { addMediaBody, addSongBody, instrumentsBody, invitationBody, profileBody } from "./schemas";

describe("request schemas", () => {
  test("an invitation's email is trimmed and lowercased", () => {
    expect(invitationBody.parse({ email: " Lea@Example.COM ", language: "fr" })).toEqual({
      email: "lea@example.com",
      language: "fr",
    });
    expect(invitationBody.safeParse({ email: "lea", language: "fr" }).success).toBe(false);
  });

  test("a song needs a title and an artist; blank optional text is null", () => {
    const song = {
      title: " Creep ",
      artist: "Radiohead",
      standardDuration: 238,
      ownDuration: null,
    };
    expect(addSongBody.parse({ ...song, notes: "  " })).toMatchObject({
      title: "Creep",
      notes: null,
    });
    expect(addSongBody.safeParse({ ...song, title: " " }).success).toBe(false);
  });

  test("a link is an http(s) URL", () => {
    expect(addMediaBody.safeParse({ url: "https://youtu.be/x" }).success).toBe(true);
    expect(addMediaBody.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
  });

  test("instruments are known codes or free text, at most MAX_INSTRUMENTS", () => {
    const list = (n: number) => Array.from({ length: n }, () => ({ code: "guitar" }));
    expect(instrumentsBody.safeParse({ instruments: list(MAX_INSTRUMENTS) }).success).toBe(true);
    expect(instrumentsBody.safeParse({ instruments: list(MAX_INSTRUMENTS + 1) }).success).toBe(
      false,
    );
    expect(instrumentsBody.safeParse({ instruments: [{ other: 1 }] }).success).toBe(false);
  });

  test("a profile needs a first and last name", () => {
    expect(profileBody.safeParse({ firstName: "Lea", lastName: " " }).success).toBe(false);
  });
});
