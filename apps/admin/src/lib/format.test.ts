import { describe, expect, test } from "bun:test";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  test("in powers of 1000, one decimal under 100", () => {
    expect(formatBytes(0)).toBe("0 bytes");
    expect(formatBytes(999)).toBe("999 bytes");
    expect(formatBytes(4_400_000)).toBe("4.4 MB");
    expect(formatBytes(120_000_000)).toBe("120 MB");
    expect(formatBytes(1_500_000_000)).toBe("1.5 GB");
  });
});
