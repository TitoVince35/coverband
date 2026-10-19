import { displayName } from "@coverband/shared";
import { and, eq } from "drizzle-orm";
import { recordActivity } from "./activity";
import type { SessionUser } from "./auth";
import { createBand } from "./bands";
import { accounts, bandMembers, bands, invitations, users } from "./db/schema";
import type { AppDeps } from "./deps";
import { AppError } from "./errors";
import { cleanInstruments, writeInstruments } from "./instruments";
import { hashToken, invitationStatus } from "./invitations";

type Deps = Pick<AppDeps, "db" | "auth"> & { now?: () => Date };

/** Why an invitation that isn't pending can't be used. */
const PROBLEMS = {
  expired: () => new AppError("invitation_expired", "Invitation expired"),
  revoked: () => new AppError("invitation_revoked", "Invitation revoked"),
  accepted: () => new AppError("invitation_used", "Invitation already used"),
} as const;

const notFound = () => new AppError("invitation_not_found", "Invitation not found");

/** Public view of an invitation, for the wizard. Throws if it can no longer be used. */
export async function getInvitation({ db, now = () => new Date() }: Deps, token: string) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      language: invitations.language,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      inviterName: users.name,
      bandName: bands.name,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedById))
    .leftJoin(bands, eq(bands.id, invitations.bandId))
    .where(eq(invitations.tokenHash, hashToken(token)));
  if (!row) throw notFound();
  const status = invitationStatus(row, now());
  if (status !== "pending") throw PROBLEMS[status]();

  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.email));
  return {
    email: row.email,
    role: row.role,
    language: row.language,
    inviterName: row.inviterName,
    bandName: row.bandName,
    hasAccount: account !== undefined,
  };
}

export type OnboardingInput = {
  /** Optional: the main instrument, the first of the member's list in this band. */
  instrument?: { code: string } | { label: string } | undefined;
  /** Leaders only: the band they create. */
  bandName?: string | undefined;
  genre?: string | undefined;
  /** Only for someone without an account yet. */
  newAccount?:
    | { firstName: string; lastName: string; nickname?: string | undefined; password: string }
    | undefined;
};

/**
 * Accepts an invitation, all in one transaction: creates the account (if needed), then either the
 * band and the leader membership (band leader invitation) or the musician membership of the
 * inviting band, and consumes the invitation. Someone who already has an account must be logged
 * in with it.
 */
export async function acceptInvitation(
  deps: Deps,
  token: string,
  input: OnboardingInput,
  sessionUser: SessionUser | null,
) {
  const now = deps.now?.() ?? new Date();
  const passwordHash = input.newAccount
    ? await (await deps.auth.$context).password.hash(input.newAccount.password)
    : null;

  return createMembership(deps, token, input, sessionUser, now, passwordHash);
}

function createMembership(
  deps: Deps,
  token: string,
  input: OnboardingInput,
  sessionUser: SessionUser | null,
  now: Date,
  passwordHash: string | null,
) {
  return deps.db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)))
      .for("update");
    if (!invitation) throw notFound();
    const status = invitationStatus(invitation, now);
    if (status !== "pending") throw PROBLEMS[status]();

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email));

    let userId: string;
    if (existing) {
      if (!sessionUser) {
        throw new AppError("unauthorized", "Log in to accept this invitation");
      }
      if (sessionUser.id !== existing.id) {
        throw new AppError("invitation_wrong_account", "Logged in as someone else");
      }
      userId = existing.id;
    } else {
      if (sessionUser) {
        throw new AppError("invitation_wrong_account", "Logged in as someone else");
      }
      if (!input.newAccount || !passwordHash) {
        throw new AppError("bad_request", "Profile and password are required");
      }
      const { firstName, lastName, nickname, password: _ } = input.newAccount;
      const [user] = await tx
        .insert(users)
        .values({
          email: invitation.email,
          // The link was sent to this address, so it's verified.
          emailVerified: true,
          name: displayName({ firstName, lastName, nickname }),
          firstName,
          lastName,
          nickname: nickname || null,
          role: "user",
        })
        .returning({ id: users.id });
      if (!user) throw new Error("User insert returned nothing");
      userId = user.id;
      // Same shape as Better Auth's own email + password accounts.
      await tx
        .insert(accounts)
        .values({ userId, accountId: userId, providerId: "credential", password: passwordHash });
      await recordActivity(tx, {
        action: "user.registered",
        bandId: null,
        actorId: userId,
        target: { type: "user", id: userId },
        data: { invitationId: invitation.id },
      });
    }

    let band: { id: string; slug: string };
    if (invitation.role === "leader") {
      if (!input.bandName) {
        throw new AppError("bad_request", "Band name is required");
      }
      band = await createBand(tx, { name: input.bandName, genre: input.genre });
      await recordActivity(tx, {
        action: "band.created",
        bandId: band.id,
        actorId: userId,
        target: { type: "band", id: band.id },
      });
    } else {
      const [joined] = await tx
        .select({ id: bands.id, slug: bands.slug })
        .from(bands)
        .where(eq(bands.id, invitation.bandId ?? ""));
      if (!joined) throw notFound();
      const [member] = await tx
        .select({ userId: bandMembers.userId })
        .from(bandMembers)
        .where(and(eq(bandMembers.bandId, joined.id), eq(bandMembers.userId, userId)));
      if (member) {
        throw new AppError("already_member", "Already a member of this band");
      }
      band = joined;
    }

    await tx.insert(bandMembers).values({ bandId: band.id, userId, role: invitation.role });
    await writeInstruments(
      tx,
      { bandId: band.id, userId },
      input.instrument ? cleanInstruments([input.instrument]) : [],
    );
    await recordActivity(tx, {
      action: "member.joined",
      bandId: band.id,
      actorId: userId,
      target: { type: "user", id: userId },
      data: { role: invitation.role, invitationId: invitation.id },
    });
    await tx
      .update(invitations)
      .set({ acceptedAt: now, bandId: band.id })
      .where(eq(invitations.id, invitation.id));

    return { userId, email: invitation.email, bandSlug: band.slug, newAccount: !existing };
  });
}
