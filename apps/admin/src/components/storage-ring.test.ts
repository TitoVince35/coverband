import { describe, expect, test } from "bun:test";
import { formatShare, usedShare } from "./storage-ring";

describe("storage ring", () => {
  test("the share used, kept between 0 and 1", () => {
    expect(usedShare(250, 1000)).toBe(0.25);
    expect(usedShare(1500, 1000)).toBe(1);
    expect(usedShare(10, 0)).toBe(0);
  });

  test("one decimal under 10 %, so a little use doesn't read as none", () => {
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.00176)).toBe("0.2%");
    expect(formatShare(0.25)).toBe("25%");
    expect(formatShare(1)).toBe("100%");
  });
});
