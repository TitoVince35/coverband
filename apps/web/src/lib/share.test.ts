import { describe, expect, test } from "bun:test";
import { posterFileName } from "./share";

describe("posterFileName", () => {
  test("the title, safe for a file system, with its extension", () => {
    expect(posterFileName("Rock night: flyer", "jpg")).toBe("Rock night  flyer.jpg");
    expect(posterFileName("Square", "png")).toBe("Square.png");
    expect(posterFileName("  ", "webp")).toBe("poster.webp");
  });
});
