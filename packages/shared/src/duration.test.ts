import { describe, expect, test } from "bun:test";
import { formatDuration } from "./duration";

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
