import { describe, expect, test } from "bun:test";
import { textParts } from "./notifications";

describe("textParts", () => {
  test("plain text stays one part, line breaks kept", () => {
    expect(textParts("Hello\n\nband")).toEqual([{ text: "Hello\n\nband" }]);
    expect(textParts("")).toEqual([]);
  });

  test("web addresses become links, the punctuation after them stays text", () => {
    expect(
      textParts("See https://coverband.fr/news. And http://x.io/a?b=1, (https://y.fr)"),
    ).toEqual([
      { text: "See " },
      { url: "https://coverband.fr/news" },
      { text: ". And " },
      { url: "http://x.io/a?b=1" },
      { text: ", (" },
      { url: "https://y.fr" },
      { text: ")" },
    ]);
    expect(textParts("https://a.fr")).toEqual([{ url: "https://a.fr" }]);
  });

  test("only http and https", () => {
    expect(textParts("javascript:alert(1) ftp://x.fr")).toEqual([
      { text: "javascript:alert(1) ftp://x.fr" },
    ]);
  });
});
