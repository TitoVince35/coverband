import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { ADMIN, PASSWORD } from "./support";

/**
 * Creates this run's admin (the only way in: there's no public sign-up), with the same password
 * hash and account shape as Better Auth's own email + password accounts. Not the developer's own
 * admin, whose password may have changed since `.env` was written.
 */
export default async function setup() {
  const sql = postgres(databaseUrl(), { prepare: false, onnotice: () => {} });
  try {
    const [user] = await sql`
      insert into users (name, email, email_verified, role)
      values ('E2E Admin', ${ADMIN}, true, 'admin')
      returning id`;
    await sql`
      insert into accounts (account_id, provider_id, user_id, password)
      values (${user?.id}, 'credential', ${user?.id}, ${await hashPassword(PASSWORD)})`;
  } finally {
    await sql.end();
  }
}

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (the local Postgres from docker-compose)");
  return url;
}
