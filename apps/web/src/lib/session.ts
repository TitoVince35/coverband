// The session the app keeps, apart from the Better Auth client (which needs a browser to load).
import type { authClient } from "@/lib/auth";

/** The session as Better Auth gives it. */
export type AuthSession = typeof authClient.$Infer.Session;

/**
 * The session as the app keeps it: the user, and the session without its token (the cookie's
 * secret, `httpOnly` so no script reads it), IP or browser. The app needs none of them, and the
 * session is saved on the device for offline use (#165).
 */
export type Session = {
  user: AuthSession["user"];
  session: Omit<AuthSession["session"], "token" | "ipAddress" | "userAgent">;
};

/** Keeps only what the app uses of Better Auth's session (see Session). */
export function appSession(data: AuthSession): Session {
  const { token: _token, ipAddress: _ip, userAgent: _agent, ...session } = data.session;
  return { user: data.user, session };
}
