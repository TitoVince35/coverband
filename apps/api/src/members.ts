import { avatarUrl } from "@coverband/shared";
import { asc, eq } from "drizzle-orm";
import { ownAvatarKey } from "./avatars";
import type { Db } from "./db/client";
import { bandMembers, users } from "./db/schema";
import { instrumentsOf } from "./instruments";

/**
 * A band's lineup, by join date: each member's names, role and instruments. The storage key of
 * their avatar stays on the server: members get its URL (null: default avatar).
 */
export async function lineupOf(db: Db, bandId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      nickname: users.nickname,
      role: bandMembers.role,
      joinedAt: bandMembers.joinedAt,
      image: users.image,
    })
    .from(bandMembers)
    .innerJoin(users, eq(users.id, bandMembers.userId))
    .where(eq(bandMembers.bandId, bandId))
    .orderBy(asc(bandMembers.joinedAt));
  const instruments = await instrumentsOf(
    db,
    bandId,
    rows.map((row) => row.userId),
  );
  return rows.map(({ image, ...member }) => ({
    ...member,
    instruments: instruments.get(member.userId) ?? [],
    avatarUrl: avatarUrl(member.userId, ownAvatarKey(member.userId, image)),
  }));
}
