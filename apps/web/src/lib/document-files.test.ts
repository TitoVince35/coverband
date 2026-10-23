import { describe, expect, test } from "bun:test";
import { DOCUMENT_ACCEPT, isPhoto, titleFrom } from "./document-files";

describe("documents (#239)", () => {
  test("the picker offers photos and the four kinds' extensions", () => {
    expect(DOCUMENT_ACCEPT.split(",")).toEqual(
      expect.arrayContaining(["image/*", ".pdf", ".gp", ".gp5", ".gpx", ".mscz", ".mscx"]),
    );
  });

  test("photos are shrunk; never an SVG or a GIF", () => {
    expect(isPhoto({ type: "image/jpeg" })).toBe(true);
    expect(isPhoto({ type: "image/heic" })).toBe(true);
    expect(isPhoto({ type: "image/svg+xml" })).toBe(false);
    expect(isPhoto({ type: "image/gif" })).toBe(false);
    expect(isPhoto({ type: "application/pdf" })).toBe(false);
  });

  test("a picked file suggests its title", () => {
    expect(titleFrom("horns_part.pdf")).toBe("horns part");
    expect(titleFrom("IMG 2041.HEIC")).toBe("IMG 2041");
    expect(titleFrom("Zombie.v2.gp")).toBe("Zombie.v2");
    expect(titleFrom("x".repeat(150)).length).toBe(100);
  });
});
