import { describe, expect, test } from "bun:test";
import { loadDatabaseEnv, loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
};

describe("loadEnv", () => {
  test("accepts a complete environment", () => {
    const env = loadEnv(valid);
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.PORT).toBe(3000);
  });

  test("rejects a missing or non-postgres URL", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...valid, DATABASE_URL: "https://example.com" })).toThrow(
      /DATABASE_URL/,
    );
  });

  test("requires a long auth secret", () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("default admin: both variables or neither, and a policy-compliant password", () => {
    const admin = { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "long enough password" };
    expect(loadEnv({ ...valid, ...admin }).ADMIN_EMAIL).toBe("admin@example.com");
    expect(() => loadEnv({ ...valid, ADMIN_EMAIL: admin.ADMIN_EMAIL })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadEnv({ ...valid, ...admin, ADMIN_PASSWORD: "short" })).toThrow(
      /ADMIN_PASSWORD/,
    );
  });
});

describe("loadDatabaseEnv", () => {
  test("only needs the database URL", () => {
    expect(loadDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL).toBe(
      valid.DATABASE_URL,
    );
  });
});
