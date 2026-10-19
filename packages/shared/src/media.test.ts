import { describe, expect, test } from "bun:test";
import { mediaProvider, parseMediaUrl } from "./media";

describe("media links", () => {
  test("only http and https URLs", () => {
    expect(parseMediaUrl(" https://youtu.be/abc ")?.hostname).toBe("youtu.be");
    expect(parseMediaUrl("http://example.com/tab")).not.toBeNull();
    for (const text of [
      "javascript:alert(1)",
      "ftp://x.org/a",
      "youtube.com/watch",
      "",
      "not a url",
    ]) {
      expect(parseMediaUrl(text)).toBeNull();
    }
    expect(parseMediaUrl(`https://x.org/${"a".repeat(2000)}`)).toBeNull();
  });

  test("detects the provider from the domain, subdomains included", () => {
    expect(mediaProvider("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(mediaProvider("https://m.youtube.com/watch?v=abc")).toBe("youtube");
    expect(mediaProvider("https://youtu.be/abc")).toBe("youtube");
    expect(mediaProvider("https://open.spotify.com/track/1")).toBe("spotify");
    expect(mediaProvider("https://www.deezer.com/fr/track/1")).toBe("deezer");
    expect(mediaProvider("https://music.apple.com/fr/album/1")).toBe("apple_music");
    expect(mediaProvider("https://soundcloud.com/a/b")).toBe("soundcloud");
  });

  test("any other site is a plain link", () => {
    expect(mediaProvider("https://www.ultimate-guitar.com/tab/1")).toBeNull();
    expect(mediaProvider("https://apple.com/music")).toBeNull();
    // A look-alike domain isn't the provider.
    expect(mediaProvider("https://notyoutube.com/watch")).toBeNull();
    expect(mediaProvider("https://youtube.com.evil.example/watch")).toBeNull();
  });
});
