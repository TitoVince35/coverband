import { ADMIN_ROLE } from "@coverband/shared";
import type { Auth } from "./adapters/auth";
import type { Logger } from "./core/log";

export type AdminCredentials = { email: string; password: string };

/**
 * Creates the default admin if no user has this email. Never changes an existing account: its
 * password and role stay as they are.
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

/**
 * The default admin's check, run before the first login attempt of each container rather than at
 * startup: a container start (a bot, a redirect, the nightly cron) would otherwise wake the
 * database for nothing, at least 5 minutes billed each time. A login uses the database anyway. At
 * most once per container; a failure is logged and tried again at the next login, never blocking
 * it.
 */
export function defaultAdminOnce(auth: Auth, credentials: AdminCredentials, log: Logger) {
  let check: Promise<void> | null = null;
  return () => {
    check ??= ensureAdmin(auth, credentials).then(
      (result) => log.info(result === "created" ? "Default admin created" : "Default admin exists"),
      (error) => {
        check = null;
        log.error("Default admin not checked", { err: error });
      },
    );
    return check;
  };
}
