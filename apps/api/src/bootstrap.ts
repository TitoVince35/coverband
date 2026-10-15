import { ADMIN_ROLE } from "@coverband/shared";
import type { Auth } from "./auth";

export type AdminCredentials = { email: string; password: string };

/**
 * Creates the default admin if no user has this email. Runs at every startup (containers restart
 * often), so it never changes an existing account: its password and role stay as they are.
 */
export async function ensureAdmin(
  auth: Auth,
  { email, password }: AdminCredentials,
): Promise<"created" | "exists"> {
  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email.toLowerCase())) {
    return "exists";
  }
  try {
    await auth.api.createUser({
      body: { email, password, name: "Admin", role: ADMIN_ROLE, data: { emailVerified: true } },
    });
    return "created";
  } catch (error) {
    // Another container created it at the same time.
    if (await ctx.internalAdapter.findUserByEmail(email.toLowerCase())) {
      return "exists";
    }
    throw error;
  }
}
