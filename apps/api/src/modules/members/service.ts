import { avatarUrl } from "@coverband/shared";
import type { Db } from "../../core/db/client";
import { membersOf } from "../bands/service";
import { instrumentsOf } from "../instruments/service";
import { ownAvatarKey } from "../profile/service";

/**
 * A band's lineup, by join date: each member's names, role and instruments. The storage key of
 * their avatar stays on the server: members get its URL (null: default avatar).
 */
export async function lineupOf(db: Db, bandId: string) {
  const rows = await membersOf(db, bandId);
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
