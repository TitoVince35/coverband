import { queryOptions } from "@tanstack/react-query";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Better Auth endpoints live under /api/auth on the same origin (Vite proxies /api in development).
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [adminClient()],
});

export type Session = typeof authClient.$Infer.Session;

/** Current session, or null when logged out. Route guards read it with ensureQueryData. */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<Session | null> => {
    const { data, error } = await authClient.getSession();
    if (error) {
      throw new Error(error.message ?? "Could not load the session");
    }
    return data;
  },
  staleTime: 5 * 60 * 1000,
});
