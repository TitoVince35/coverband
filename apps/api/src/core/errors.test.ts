import { expect, test } from "bun:test";
import { Hono } from "hono";
import { AppError, appErrorResponse } from "./errors";

class TooLateError extends AppError {
  constructor() {
    super("invitation_expired", "Invitation expired");
  }
}

const app = new Hono()
  .onError((error, c) => {
    if (error instanceof AppError) return appErrorResponse(c, error);
    throw error;
  })
  .get("/late", () => {
    throw new TooLateError();
  })
  .get("/duplicate", () => {
    throw new AppError("song_duplicate", "Already there", { id: "s1", title: "Creep" });
  });

test("an AppError becomes its JSON error, with the status of its code", async () => {
  const res = await app.request("/late");
  expect(res.status).toBe(410);
  expect(await res.json()).toEqual({
    error: { code: "invitation_expired", message: "Invitation expired" },
  });
});

test("an AppError's details are sent", async () => {
  const res = await app.request("/duplicate");
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({
    error: {
      code: "song_duplicate",
      message: "Already there",
      details: { id: "s1", title: "Creep" },
    },
  });
});

test("a subclass keeps its own name", () => {
  expect(new TooLateError().name).toBe("TooLateError");
});
