import { describe, expect, test } from "bun:test";
import { createLogger, createMemoryLogger, type LoggerOptions } from "./log";

const time = new Date("2026-10-20T09:15:42.123Z");

function capture(options: Pick<LoggerOptions, "level" | "format">) {
  const lines: string[] = [];
  const log = createLogger({ ...options, write: (line) => lines.push(line), now: () => time });
  return { log, lines };
}

describe("createLogger", () => {
  test("json: one object per line, with time, level, message and fields", () => {
    const { log, lines } = capture({ level: "info", format: "json" });
    log.info("Server started", { version: "0.1.1", port: 3000 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      time: "2026-10-20T09:15:42.123Z",
      level: "info",
      msg: "Server started",
      version: "0.1.1",
      port: 3000,
    });
  });

  test("leaves out entries below its level", () => {
    const { log, lines } = capture({ level: "warn", format: "json" });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines.map((line) => JSON.parse(line).level)).toEqual(["warn", "error"]);
  });

  test("a child adds its fields to every entry, and children stack", () => {
    const { log, entries } = createMemoryLogger();
    const request = log.child({ requestId: "r1" });
    request.child({ userId: "u1" }).info("Inside", { status: 200 });
    request.info("Before the user");
    log.info("Outside");
    expect(entries).toMatchObject([
      { msg: "Inside", requestId: "r1", userId: "u1", status: 200 },
      { msg: "Before the user", requestId: "r1" },
      { msg: "Outside" },
    ]);
    expect(entries[1]).not.toHaveProperty("userId");
    expect(entries[2]).not.toHaveProperty("requestId");
  });

  test("json: errors keep their name, message, stack and cause", () => {
    const { log, entries } = createMemoryLogger();
    log.error("Unhandled error", {
      err: new TypeError("boom", { cause: new Error("root") }),
      big: 12n,
    });
    expect(entries[0]).toMatchObject({
      err: { name: "TypeError", message: "boom", cause: { message: "root" } },
      big: "12",
    });
    const err = entries[0]?.err as { stack: string } | undefined;
    expect(err?.stack).toContain("log.test.ts");
  });

  test("pretty: a readable line, the stack on the following lines", () => {
    const { log, lines } = capture({ level: "debug", format: "pretty" });
    log.debug("Request", { method: "GET", route: "/api/health", status: 200 });
    log.error("Unhandled error", { err: new Error("boom"), ids: ["a", "b"] });
    expect(lines[0]).toBe("09:15:42.123 DEBUG Request method=GET route=/api/health status=200");
    const [head, ...stack] = (lines[1] ?? "").split("\n");
    expect(head).toBe('09:15:42.123 ERROR Unhandled error err=Error: boom ids=["a","b"]');
    expect(stack[0]).toBe("Error: boom");
    expect(stack.length).toBeGreaterThan(1);
  });
});
