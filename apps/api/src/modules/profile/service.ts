import { displayName } from "@coverband/shared";
import { eq } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { accounts, users } from "../../core/db/schema";

// The module's face for the others: avatar keys are checked here.
export { ownAvatarKey } from "./avatars";

/** The id of the account with this email, or null. */
export async function accountIdOf(db: Db | Tx, email: string): Promise<string | null> {
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return account?.id ?? null;
}

/**
 * Creates an email + password account, with the same shape as Better Auth's own (a `credential`
 * account holding the password hash). The email is verified: the invitation link was sent to it.
 */
export async function createAccount(
  tx: Tx,
  input: { email: string; firstName: string; lastName: string; nickname?: string | undefined },
  passwordHash: string,
  invitationId: string,
) {
  const { email, firstName, lastName } = input;
  const nickname = input.nickname || null;
  const [user] = await tx
    .insert(users)
    .values({
      email,
      emailVerified: true,
      name: displayName({ firstName, lastName, nickname }),
      firstName,
      lastName,
      nickname,
      role: "user",
    })
    .returning({ id: users.id });
  if (!user) throw new Error("User insert returned nothing");
  await tx.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: passwordHash,
  });
  await recordActivity(tx, {
    action: "user.registered",
    bandId: null,
    actorId: user.id,
    target: { type: "user", id: user.id },
    data: { invitationId },
  });
  return user.id;
}

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
