import { expect, test } from "bun:test";
import { isApiRequest } from "./slow-network";

test("isApiRequest: the API's requests on the app's origin only", () => {
  const origin = "https://192.168.1.98:5173";
  expect(isApiRequest("/api/bands", origin)).toBe(true);
  expect(isApiRequest(new URL("/api/auth/get-session", origin), origin)).toBe(true);
  expect(isApiRequest(new Request(`${origin}/api/health`), origin)).toBe(true);
  // The app's own files, and other sites, are never slowed down.
  expect(isApiRequest("/assets/index.js", origin)).toBe(false);
  expect(isApiRequest("/apis", origin)).toBe(false);
  expect(isApiRequest("https://lrclib.net/api/search", origin)).toBe(false);
});
