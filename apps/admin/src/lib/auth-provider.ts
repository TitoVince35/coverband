import { ADMIN_ROLE } from "@coverband/shared";
import type { AuthProvider } from "ra-core";
import { apiFetch } from "@/lib/api";

type SessionUser = { id: string; name: string; email: string; role?: string | null };
type Session = { user: SessionUser } | null;

/** Said to someone who logs in without the admin role: they are signed out at once. */
export const ADMINS_ONLY = "This console is for administrators only.";

const signOut = () => apiFetch("/api/auth/sign-out", { method: "POST", body: "{}" });

async function adminSession() {
  const session = await apiFetch<Session>("/api/auth/get-session");
  return session?.user.role === ADMIN_ROLE ? session : null;
}

/**
 * Better Auth's email and password login, on the admin host (its own session cookie, #246).
 * Only admins stay logged in; `/api/admin` checks it again on every request.
 */
export const authProvider: AuthProvider = {
  async login({ email, password }: { email: string; password: string }) {
    const { user } = await apiFetch<{ user: SessionUser }>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (user.role !== ADMIN_ROLE) {
      await signOut();
      throw new Error(ADMINS_ONLY);
    }
  },
  async logout() {
    await signOut().catch(() => {});
  },
  async checkAuth() {
    if (!(await adminSession())) throw new Error("Not logged in as an admin");
  },
  async checkError(error: { status?: number }) {
    if (error.status === 401 || error.status === 403) throw new Error("Session ended");
  },
  async getIdentity() {
    const session = await adminSession();
    if (!session) throw new Error("Not logged in as an admin");
    return { id: session.user.id, fullName: session.user.name };
  },
};
