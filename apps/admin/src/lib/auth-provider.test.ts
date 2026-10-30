import { afterEach, describe, expect, test } from "bun:test";
import { HttpError } from "ra-core";
import { ADMINS_ONLY, authProvider } from "./auth-provider";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers each API path with its JSON body (status 200), recording the calls. */
function fakeApi(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const answer = answers[path] ?? { status: 404, body: { error: { message: "Not found" } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const credentials = { email: "ada@test.localhost", password: "secret" };

describe("authProvider", () => {
  test("an admin logs in", async () => {
    const calls = fakeApi({
      "/api/auth/sign-in/email": { body: { user: { id: "1", name: "Ada", role: "admin" } } },
    });
    await authProvider.login(credentials);
    expect(calls).toEqual(["POST /api/auth/sign-in/email"]);
  });

  test("anyone else is signed out at once, and told why", async () => {
    const calls = fakeApi({
      "/api/auth/sign-in/email": { body: { user: { id: "2", name: "Max", role: "user" } } },
      "/api/auth/sign-out": { body: { success: true } },
    });
    await expect(authProvider.login(credentials)).rejects.toThrow(ADMINS_ONLY);
    expect(calls).toEqual(["POST /api/auth/sign-in/email", "POST /api/auth/sign-out"]);
  });

  test("a wrong password says Better Auth's message", async () => {
    fakeApi({
      "/api/auth/sign-in/email": {
        status: 401,
        body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      },
    });
    const error = await authProvider.login(credentials).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toBe("Invalid email or password");
    expect((error as HttpError).status).toBe(401);
  });

  test("only an admin session counts as logged in", async () => {
    fakeApi({
      "/api/auth/get-session": { body: { user: { id: "1", name: "Ada", role: "admin" } } },
    });
    await authProvider.checkAuth({});
    expect(await authProvider.getIdentity?.()).toEqual({ id: "1", fullName: "Ada" });

    fakeApi({
      "/api/auth/get-session": { body: { user: { id: "2", name: "Max", role: "user" } } },
    });
    await expect(authProvider.checkAuth({})).rejects.toThrow();
    fakeApi({ "/api/auth/get-session": { body: null } });
    await expect(authProvider.checkAuth({})).rejects.toThrow();
  });

  test("a 401 or 403 from the API logs out, other errors don't", async () => {
    await expect(authProvider.checkError({ status: 401 })).rejects.toThrow();
    await expect(authProvider.checkError({ status: 403 })).rejects.toThrow();
    await expect(authProvider.checkError({ status: 500 })).resolves.toBeUndefined();
  });
});
