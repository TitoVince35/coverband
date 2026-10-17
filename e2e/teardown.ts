import postgres from "postgres";
import { databaseUrl } from "./setup";

/**
 * Removes everything end-to-end tests created, including leftovers of interrupted runs: users at
 * `@e2e.localhost` (this run's admin included, with their sessions, memberships, invitations and
 * rate limit counters), "E2E " bands (with their activity). Emails are removed from Mailpit.
 */
export default async function teardown() {
  const sql = postgres(databaseUrl(), { prepare: false, onnotice: () => {} });
  try {
    const users = sql`select id from users where email like ${"%@e2e.localhost"}`;
    await sql`delete from activity where actor_id in (${users})`;
    await sql`delete from rate_limits
      where key like ${"coverband:%"} and split_part(key, ':', 3) in (select id::text from (${users}) u)`;
    await sql`delete from bands where name like ${"E2E %"}`;
    await sql`delete from invitations where email like ${"%@e2e.localhost"}`;
    await sql`delete from users where email like ${"%@e2e.localhost"}`;
  } finally {
    await sql.end();
  }
  const mailpit = process.env.MAILPIT_URL;
  if (mailpit) {
    await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent("to:@e2e.localhost")}`, {
      method: "DELETE",
    });
  }
}
