import { describe, expect, test } from "bun:test";
import { mailpitUrl } from "./mailpit";

describe("mailpitUrl", () => {
  test("points to Mailpit on the host serving the app", () => {
    expect(mailpitUrl("localhost")).toBe("http://localhost:8025");
    expect(mailpitUrl("192.168.1.20")).toBe("http://192.168.1.20:8025");
  });
});
