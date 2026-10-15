import { describe, expect, test } from "bun:test";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  test("keeps paths inside the app", () => {
    expect(safeRedirect("/admin")).toBe("/admin");
    expect(safeRedirect("/b/my-band?tab=songs")).toBe("/b/my-band?tab=songs");
  });

  test("drops other sites and non-strings", () => {
    expect(safeRedirect("https://evil.example")).toBeUndefined();
    expect(safeRedirect("//evil.example")).toBeUndefined();
    expect(safeRedirect("/\\evil.example")).toBeUndefined();
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
  });
});
