import { describe, expect, test } from "bun:test";
import { errorCodeForStatus, isErrorCode } from "./errors";

describe("errorCodeForStatus", () => {
  test("maps common statuses", () => {
    expect(errorCodeForStatus(400)).toBe("bad_request");
    expect(errorCodeForStatus(401)).toBe("unauthorized");
    expect(errorCodeForStatus(403)).toBe("forbidden");
    expect(errorCodeForStatus(404)).toBe("not_found");
    expect(errorCodeForStatus(500)).toBe("internal_error");
  });

  test("falls back by status class", () => {
    expect(errorCodeForStatus(422)).toBe("bad_request");
    expect(errorCodeForStatus(503)).toBe("internal_error");
  });
});

test("isErrorCode recognises known codes only", () => {
  expect(isErrorCode("not_found")).toBe(true);
  expect(isErrorCode("nope")).toBe(false);
  expect(isErrorCode(404)).toBe(false);
});
