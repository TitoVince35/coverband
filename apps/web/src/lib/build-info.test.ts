import { describe, expect, test } from "bun:test";
import { APP_BUILD, APP_VERSION, shortBuild } from "./build-info";

describe("build info", () => {
  test("falls back to dev without Vite", () => {
    expect(APP_VERSION).toBe("dev");
    expect(APP_BUILD).toBe("dev");
  });

  test("shortBuild keeps the first 7 characters of a commit", () => {
    expect(shortBuild("0012ca8e94d9a022b47196622938c27ae73efbba")).toBe("0012ca8");
    expect(shortBuild("dev")).toBe("dev");
  });
});
