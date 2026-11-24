import { describe, expect, test } from "bun:test";
import {
  addDays,
  firstCurrentGigDate,
  gigDay,
  gigSetlistTitle,
  inGigFilter,
  isGigDate,
  isTimeOfDay,
  isTitledAfter,
  localDateTime,
} from "./gigs";

const PARIS = "Europe/Paris";
/** An instant given as Paris wall-clock time (winter: UTC+1, summer: UTC+2). */
const paris = (local: string, offset = "+01:00") => new Date(`${local}${offset}`);

describe("addDays", () => {
  test("moves across months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("localDateTime", () => {
  test("reads the date and hour in the time zone", () => {
    expect(localDateTime(new Date("2026-11-21T23:30:00Z"), PARIS)).toEqual({
      date: "2026-11-22",
      hour: 0,
    });
    expect(localDateTime(new Date("2026-11-21T23:30:00Z"), "UTC")).toEqual({
      date: "2026-11-21",
      hour: 23,
    });
  });
});

describe("gigDay", () => {
  const saturday = "2026-11-21";

  test("a gig is today's from midnight on its date", () => {
    expect(gigDay(saturday, paris("2026-11-20T23:59:59"), PARIS)).toBe("upcoming");
    expect(gigDay(saturday, paris("2026-11-21T00:00:00"), PARIS)).toBe("today");
    expect(gigDay(saturday, paris("2026-11-21T21:00:00"), PARIS)).toBe("today");
  });

  test("a Saturday night gig is still today's on Sunday until 6 AM", () => {
    expect(gigDay(saturday, paris("2026-11-22T02:00:00"), PARIS)).toBe("today");
    expect(gigDay(saturday, paris("2026-11-22T05:59:59"), PARIS)).toBe("today");
    expect(gigDay(saturday, paris("2026-11-22T06:00:00"), PARIS)).toBe("past");
  });

  test("the next day's gig is today's at 2 AM too", () => {
    expect(gigDay("2026-11-22", paris("2026-11-22T02:00:00"), PARIS)).toBe("today");
  });

  test("the last day of a month and of a year", () => {
    expect(gigDay("2026-10-31", paris("2026-11-01T05:59:00"), PARIS)).toBe("today");
    expect(gigDay("2026-10-31", paris("2026-11-01T06:00:00"), PARIS)).toBe("past");
    expect(gigDay("2026-12-31", paris("2027-01-01T05:59:00"), PARIS)).toBe("today");
    expect(gigDay("2026-12-31", paris("2027-01-01T06:00:00"), PARIS)).toBe("past");
    expect(gigDay("2027-01-01", paris("2026-12-31T23:00:00"), PARIS)).toBe("upcoming");
  });

  test("uses the time zone given", () => {
    // 05:30 UTC is 06:30 in Paris (over) but 00:30 in New York (still today's).
    const now = new Date("2026-11-22T05:30:00Z");
    expect(gigDay(saturday, now, PARIS)).toBe("past");
    expect(gigDay(saturday, now, "America/New_York")).toBe("today");
  });

  test("summer time", () => {
    expect(gigDay("2026-06-20", paris("2026-06-21T05:59:00", "+02:00"), PARIS)).toBe("today");
    expect(gigDay("2026-06-20", paris("2026-06-21T06:00:00", "+02:00"), PARIS)).toBe("past");
  });
});

describe("firstCurrentGigDate", () => {
  test("yesterday before 6 AM, today from then on", () => {
    expect(firstCurrentGigDate(paris("2026-11-22T05:59:00"), PARIS)).toBe("2026-11-21");
    expect(firstCurrentGigDate(paris("2026-11-22T06:00:00"), PARIS)).toBe("2026-11-22");
  });
});

describe("inGigFilter", () => {
  const now = paris("2026-11-22T02:00:00");
  test("next is today's and upcoming gigs, past the others, all every one", () => {
    expect(inGigFilter("2026-11-21", "next", now, PARIS)).toBe(true);
    expect(inGigFilter("2026-11-20", "next", now, PARIS)).toBe(false);
    expect(inGigFilter("2026-11-20", "past", now, PARIS)).toBe(true);
    expect(inGigFilter("2026-11-21", "past", now, PARIS)).toBe(false);
    expect(inGigFilter("2020-01-01", "all", now, PARIS)).toBe(true);
  });
});

describe("form values", () => {
  test("dates", () => {
    expect(isGigDate("2026-02-28")).toBe(true);
    expect(isGigDate("2026-02-29")).toBe(false);
    expect(isGigDate("2026-2-1")).toBe(false);
  });
  test("times", () => {
    expect(isTimeOfDay("21:00")).toBe(true);
    expect(isTimeOfDay("00:05")).toBe(true);
    expect(isTimeOfDay("24:00")).toBe(false);
    expect(isTimeOfDay("9:00")).toBe(false);
  });
});

describe("gigSetlistTitle (#358)", () => {
  test("the gig's name, then its date", () => {
    expect(gigSetlistTitle("Le Bar'Hic", "2026-12-05", 100)).toBe("Le Bar'Hic · 2026-12-05");
  });

  test("a long name is cut: the date and a number always fit", () => {
    const title = gigSetlistTitle("x".repeat(200), "2026-12-05", 100);
    expect(title.endsWith(" · 2026-12-05")).toBe(true);
    expect(title.length).toBe(97);
  });
});

describe("isTitledAfter", () => {
  test("the base, or the base numbered", () => {
    expect(isTitledAfter("Gig · 2026-12-05", "Gig · 2026-12-05")).toBe(true);
    expect(isTitledAfter("Gig · 2026-12-05 2", "Gig · 2026-12-05")).toBe(true);
    expect(isTitledAfter("Gig · 2026-12-05 (copy)", "Gig · 2026-12-05")).toBe(false);
    expect(isTitledAfter("Other · 2026-12-05", "Gig · 2026-12-05")).toBe(false);
  });
});
