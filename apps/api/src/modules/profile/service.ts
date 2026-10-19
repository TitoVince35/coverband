import { displayName } from "@coverband/shared";
import { eq } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db } from "../../core/db/client";
import { users } from "../../core/db/schema";

export type ProfileInput = {
  firstName: string;
  lastName: string;
  /** Empty or missing clears it. */
  nickname?: string | undefined;
};

/**
 * Updates the logged-in user's profile. The display name (`name`, shown everywhere) is recomputed:
 * clearing the nickname brings back "First Last".
 */
export function updateProfile(db: Db, userId: string, input: ProfileInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const nickname = input.nickname?.trim() || null;
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ firstName, lastName, nickname, name: displayName({ firstName, lastName, nickname }) })
      .where(eq(users.id, userId))
      .returning({
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        nickname: users.nickname,
      });
    if (!user) throw new Error("User update returned nothing");
    await recordActivity(tx, {
      action: "user.profile_updated",
      bandId: null,
      actorId: userId,
      target: { type: "user", id: userId },
    });
    return user;
  });
}
