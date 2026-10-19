import { asc } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { users } from "../../core/db/schema";
import { allMemberships } from "../bands/service";

/** Every account, oldest first, with its bands (by name) and its role in each: the admin console. */
export async function usersWithBands(db: Db) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
  const memberships = await allMemberships(db);
  return rows.map((user) => ({
    ...user,
    bands: memberships.filter((m) => m.userId === user.id).map(({ userId: _, ...band }) => band),
  }));
}
