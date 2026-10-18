import { describe, expect, test } from "bun:test";
import { formatJournalTime } from "./format";

const words = { today: "Today", yesterday: "Yesterday" };
const now = new Date(2026, 9, 18, 17, 30);

describe("formatJournalTime", () => {
  test("today and yesterday by name, with the time", () => {
    expect(formatJournalTime(new Date(2026, 9, 18, 10, 43), now, "en-GB", words)).toBe(
      "Today 10:43",
    );
    expect(formatJournalTime(new Date(2026, 9, 17, 23, 59), now, "en-GB", words)).toBe(
      "Yesterday 23:59",
    );
  });

  test("older: day and month, the year only when it isn't this one", () => {
    expect(formatJournalTime(new Date(2026, 9, 12, 23, 45), now, "en-GB", words)).toBe(
      "12 Oct 23:45",
    );
    expect(formatJournalTime(new Date(2026, 9, 12, 23, 45), now, "fr", words)).toBe(
      "12 oct. 23:45",
    );
    expect(formatJournalTime(new Date(2025, 11, 31, 8, 5), now, "en-GB", words)).toBe(
      "31 Dec 2025 08:05",
    );
  });

  test("calendar days, not 24-hour periods", () => {
    const justAfterMidnight = new Date(2026, 9, 18, 0, 10);
    expect(
      formatJournalTime(new Date(2026, 9, 17, 23, 50), justAfterMidnight, "en-GB", words),
    ).toBe("Yesterday 23:50");
  });
});
