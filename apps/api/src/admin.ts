import { asc, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { bandMembers, bands, users } from "./db/schema";

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
  const memberships = await db
    .select({
      userId: bandMembers.userId,
      bandName: bands.name,
      bandSlug: bands.slug,
      role: bandMembers.role,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .orderBy(asc(bands.name));
  return rows.map((user) => ({
    ...user,
    bands: memberships.filter((m) => m.userId === user.id).map(({ userId: _, ...band }) => band),
  }));
}
