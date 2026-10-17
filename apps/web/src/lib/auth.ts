import { queryOptions } from "@tanstack/react-query";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { SESSION_KEY } from "@/lib/query-client";

// Better Auth endpoints live under /api/auth on the same origin (Vite proxies /api in development).
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [
    adminClient(),
    // Profile fields of the API's Better Auth config (read-only there, changed via PATCH /api/me).
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false, input: false },
        lastName: { type: "string", required: false, input: false },
        nickname: { type: "string", required: false, input: false },
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;

/** Current session, or null when logged out. Route guards read it with ensureQueryData. */
export const sessionQuery = queryOptions({
  queryKey: SESSION_KEY,
  queryFn: async (): Promise<Session | null> => {
    const { data, error } = await authClient.getSession();
    if (error) {
      throw new Error(error.message ?? "Could not load the session");
    }
    return data;
  },
});

/** Failed Better Auth call, keeping its HTTP status and error code (e.g. `INVALID_TOKEN`). */
export class AuthRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Auth request failed (${status}${code ? `, ${code}` : ""})`);
    this.name = "AuthRequestError";
  }
}

/** Throws an AuthRequestError when a Better Auth client call returned an error. */
export function ensureAuthOk(result: {
  error: { status: number; code?: string | undefined } | null;
}) {
  if (result.error) {
    throw new AuthRequestError(result.error.status, result.error.code);
  }
}
