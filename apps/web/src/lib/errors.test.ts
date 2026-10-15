import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import { ApiRequestError, ensureOk, errorMessage } from "./errors";

const t = ((key: string) => `t:${key}`) as unknown as TFunction;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ensureOk", () => {
  test("passes successful responses through", async () => {
    const res = jsonResponse(200, { status: "ok" });
    expect(await ensureOk(res)).toBe(res);
  });

  test("throws with the API error code", async () => {
    const res = jsonResponse(404, { error: { code: "not_found", message: "Not found" } });
    const error = await ensureOk(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("not_found");
  });

  test("falls back to internal_error for unknown or missing codes", async () => {
    const error = await ensureOk(new Response("oops", { status: 502 })).catch((e: unknown) => e);
    expect((error as ApiRequestError).code).toBe("internal_error");
  });
});

describe("errorMessage", () => {
  test("translates API error codes", () => {
    expect(errorMessage(t, new ApiRequestError("forbidden", "x"))).toBe("t:errors.forbidden");
  });

  test("treats fetch failures as network errors", () => {
    expect(errorMessage(t, new TypeError("Failed to fetch"))).toBe("t:errors.network");
  });

  test("uses a generic message otherwise", () => {
    expect(errorMessage(t, new Error("boom"))).toBe("t:errors.internal_error");
  });
});
