import { describe, expect, test } from "bun:test";
import { formatDuration, parseDuration } from "./duration";

describe("formatDuration", () => {
  test("formats under one hour as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(245)).toBe("4:05");
  });

  test("formats from one hour as h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(5025)).toBe("1:23:45");
  });

  test("rounds fractional seconds", () => {
    expect(formatDuration(59.6)).toBe("1:00");
  });

  test("rejects negative and non-finite values", () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseDuration", () => {
  test("reads m:ss and h:mm:ss", () => {
    expect(parseDuration("3:45")).toBe(225);
    expect(parseDuration("0:05")).toBe(5);
    expect(parseDuration("12:05")).toBe(725);
    expect(parseDuration(" 1:02:30 ")).toBe(3750);
    expect(parseDuration("75:00")).toBe(4500);
  });

  test("round-trips with formatDuration", () => {
    for (const seconds of [0, 59, 245, 3599, 3750]) {
      expect(parseDuration(formatDuration(seconds))).toBe(seconds);
    }
  });

  test("refuses what isn't a duration", () => {
    for (const text of ["", "3", "3:5", "3:60", "1:60:00", "3'45", "3.45", "-1:00", "a:bc"]) {
      expect(parseDuration(text)).toBe(null);
    }
  });
});
