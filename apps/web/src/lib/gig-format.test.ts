import { describe, expect, test } from "bun:test";
import { formatGigDate, formatShortGigDate, formatTimeOfDay, gigDateParts } from "./gig-format";

describe("gig dates", () => {
  test("a calendar date, the year only when it isn't this year's", () => {
    expect(formatGigDate("2026-12-05", "en", 2026)).toBe("Saturday, December 5");
    expect(formatGigDate("2027-01-17", "en", 2026)).toBe("Sunday, January 17, 2027");
    expect(formatGigDate("2026-12-05", "fr", 2026)).toBe("samedi 5 décembre");
    expect(formatShortGigDate("2026-12-05", "en", 2026)).toBe("Sat, Dec 5");
  });

  test("the parts of a calendar tile", () => {
    expect(gigDateParts("2026-12-05", "en")).toEqual({
      weekday: "Sat",
      day: "5",
      month: "Dec",
      year: "2026",
    });
  });

  test("times in the language's way", () => {
    expect(formatTimeOfDay("21:00", "fr")).toBe("21:00");
    expect(formatTimeOfDay("21:00", "en")).toBe("9:00 PM");
  });
});
