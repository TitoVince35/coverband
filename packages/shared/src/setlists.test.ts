import { describe, expect, test } from "bun:test";
import { hoursAndMinutes, playedDuration, setlistDuration } from "./setlists";

describe("playedDuration", () => {
  test("the band's own duration, else the original", () => {
    expect(playedDuration({ standardDuration: 200, ownDuration: 230 })).toBe(230);
    expect(playedDuration({ standardDuration: 200, ownDuration: null })).toBe(200);
    expect(playedDuration({ standardDuration: null, ownDuration: null })).toBeNull();
  });
});

describe("setlistDuration", () => {
  test("adds the played durations and counts the songs without one", () => {
    expect(
      setlistDuration([
        { standardDuration: 200, ownDuration: 230 },
        { standardDuration: 180, ownDuration: null },
        { standardDuration: null, ownDuration: null },
      ]),
    ).toEqual({ seconds: 410, missing: 1 });
  });

  test("no songs: nothing", () => {
    expect(setlistDuration([])).toEqual({ seconds: 0, missing: 0 });
  });
});

describe("hoursAndMinutes", () => {
  test("rounds to the minute", () => {
    expect(hoursAndMinutes(6719)).toEqual({ hours: 1, minutes: 52 });
    expect(hoursAndMinutes(29)).toEqual({ hours: 0, minutes: 0 });
    expect(hoursAndMinutes(3570)).toEqual({ hours: 1, minutes: 0 });
  });
});
