import { APP_NAME, type Language } from "@coverband/shared";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Mailer } from "../../adapters/mail/mailer";
import { leaderInvitationEmail, musicianInvitationEmail } from "../../adapters/mail/templates";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { invitations, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { bandOf, hasMemberWithEmail } from "../bands/service";

/** How long an invitation link stays valid (brief 004). */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export type InvitationDeps = {
  db: Db;
  mailer: Mailer;
  /** Public URL of the web app, for the link in the email. */
  appUrl: string;
  now?: () => Date;
};

/**
 * Which invitations an operation is about: band leaders (sent by admins, #22) or the musicians
 * of one band (sent by its leader, #7). An id from another scope is treated as not found.
 */
export type InvitationScope =
  | { role: "leader" }
  | { role: "musician"; band: { id: string; name: string } };

export const LEADER_INVITATIONS: InvitationScope = { role: "leader" };

export class AlreadyInvitedError extends AppError {
  constructor(email: string) {
    super("already_invited", `${email} already has a pending invitation`);
  }
}

export class AlreadyMemberError extends AppError {
  constructor(email: string) {
    super("already_member", `${email} is already a member of this band`);
  }
}

/** Random token for the link; only its hash is stored. */
function newToken(): { token: string; tokenHash: string } {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export function invitationUrl(appUrl: string, token: string): string {
  return new URL(`/invite/${token}`, appUrl).toString();
}

export function invitationStatus(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  return invitation.expiresAt <= now ? "expired" : "pending";
}

/** Why an invitation that isn't pending can't be used. */
const PROBLEMS = {
  expired: () => new AppError("invitation_expired", "Invitation expired"),
  revoked: () => new AppError("invitation_revoked", "Invitation revoked"),
  accepted: () => new AppError("invitation_used", "Invitation already used"),
} as const;

const notFound = () => new AppError("invitation_not_found", "Invitation not found");

/** Throws unless the invitation can still be accepted. */
function checkPending(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date } | undefined,
  now: Date,
) {
  if (!invitation) throw notFound();
  const status = invitationStatus(invitation, now);
  if (status !== "pending") throw PROBLEMS[status]();
}

/**
 * The invitation of a link, for the wizard: who invited, to which band (musicians). Throws
 * when it can no longer be used.
 */
export async function pendingInvitation(db: Db, token: string, now: Date) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      language: invitations.language,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      inviterName: users.name,
      bandId: invitations.bandId,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedById))
    .where(eq(invitations.tokenHash, hashToken(token)));
  checkPending(row, now);
  const { bandId, ...invitation } = row as NonNullable<typeof row>;
  return { ...invitation, bandName: bandId ? ((await bandOf(db, bandId))?.name ?? null) : null };
}

/** Locks the invitation of a link for accepting it (in that transaction). Throws when it can't be. */
export async function lockPendingInvitation(tx: Tx, token: string, now: Date) {
  const [invitation] = await tx
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .for("update");
  checkPending(invitation, now);
  return invitation as NonNullable<typeof invitation>;
}

/** Marks an accepted invitation used, with the band it led to (a band leader's new band). */
export async function consumeInvitation(tx: Tx, id: string, bandId: string, now: Date) {
  await tx.update(invitations).set({ acceptedAt: now, bandId }).where(eq(invitations.id, id));
}

/** Records an invitation event, in the scope's band (none for band leader invitations). */
function recordInvitation(
  db: Db | Tx,
  scope: InvitationScope,
  action: "invitation.sent" | "invitation.resent" | "invitation.revoked",
  invitationId: string,
  actorId: string,
) {
  return recordActivity(db, {
    action,
    bandId: scope.role === "musician" ? scope.band.id : null,
    actorId,
    target: { type: "invitation", id: invitationId },
    data: { role: scope.role },
  });
}

function inScope(scope: InvitationScope): SQL | undefined {
  return scope.role === "leader"
    ? and(eq(invitations.role, "leader"), isNull(invitations.bandId))
    : and(eq(invitations.role, "musician"), eq(invitations.bandId, scope.band.id));
}

/** Neither accepted nor revoked (but possibly expired). */
const open = () => and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

/** Open invitations of a scope, newest first, with their status. */
export async function listInvitations(
  { db, now = () => new Date() }: InvitationDeps,
  scope: InvitationScope,
) {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      language: invitations.language,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
      invitedBy: users.name,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedById))
    .where(and(inScope(scope), open()))
    .orderBy(desc(invitations.createdAt));
  const at = now();
  return rows.map(({ acceptedAt, revokedAt, ...row }) => ({
    ...row,
    status: invitationStatus({ acceptedAt, revokedAt, expiresAt: row.expiresAt }, at),
  }));
}

async function sendInvitation(
  deps: InvitationDeps,
  scope: InvitationScope,
  invitation: { email: string; language: Language; invitedById: string },
  token: string,
) {
  const [inviter] = await deps.db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invitation.invitedById));
  const inviterName = inviter?.name ?? APP_NAME;
  const url = invitationUrl(deps.appUrl, token);
  await deps.mailer.send(
    scope.role === "leader"
      ? leaderInvitationEmail(invitation.email, invitation.language, { inviterName, url })
      : musicianInvitationEmail(invitation.email, invitation.language, {
          inviterName,
          bandName: scope.band.name,
          url,
        }),
  );
}

/**
 * Invites someone, by email. The email may already have an account: a leader then only creates a
 * band (#23), a musician only joins (#7). One open, unexpired invitation per email and scope.
 */
export async function invite(
  deps: InvitationDeps,
  scope: InvitationScope,
  input: { email: string; language: Language; invitedById: string },
) {
  const now = deps.now?.() ?? new Date();
  const email = input.email.trim().toLowerCase();
  const { token, tokenHash } = newToken();

  const invitation = await deps.db.transaction(async (tx) => {
    // Serializes concurrent invitations of the same email.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invite:${email}`}))`);
    if (scope.role === "musician") {
      if (await hasMemberWithEmail(tx, scope.band.id, email)) throw new AlreadyMemberError(email);
    }
    const pending = await tx
      .select({ expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(and(eq(invitations.email, email), inScope(scope), open()));
    if (pending.some((row) => row.expiresAt > now)) {
      throw new AlreadyInvitedError(email);
    }
    const [created] = await tx
      .insert(invitations)
      .values({
        email,
        role: scope.role,
        bandId: scope.role === "musician" ? scope.band.id : null,
        language: input.language,
        invitedById: input.invitedById,
        tokenHash,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      })
      .returning();
    if (!created) throw new Error("Invitation insert returned nothing");
    return created;
  });

  try {
    await sendInvitation(deps, scope, invitation, token);
  } catch (error) {
    // Not sent: drop it so the inviter can simply try again.
    await deps.db.delete(invitations).where(eq(invitations.id, invitation.id));
    throw error;
  }
  // Only now: an invitation whose email failed is deleted, so it never existed.
  await recordInvitation(deps.db, scope, "invitation.sent", invitation.id, input.invitedById);
  return invitation;
}

/** Sends a new link valid for another 48 hours; the previous link stops working. */
export async function resendInvitation(
  deps: InvitationDeps,
  scope: InvitationScope,
  id: string,
  actorId: string,
) {
  const now = deps.now?.() ?? new Date();
  const { token, tokenHash } = newToken();
  const [invitation] = await deps.db
    .update(invitations)
    .set({ tokenHash, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) })
    .where(and(eq(invitations.id, id), inScope(scope), open()))
    .returning();
  if (!invitation) return null;
  await sendInvitation(deps, scope, invitation, token);
  await recordInvitation(deps.db, scope, "invitation.resent", invitation.id, actorId);
  return invitation;
}

/** Revokes an open invitation: its link stops working. Returns false if there was none. */
export async function revokeInvitation(
  deps: InvitationDeps,
  scope: InvitationScope,
  id: string,
  actorId: string,
) {
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(and(eq(invitations.id, id), inScope(scope), open()))
      .returning({ id: invitations.id });
    if (!revoked) return false;
    await recordInvitation(tx, scope, "invitation.revoked", revoked.id, actorId);
    return true;
  });
}

// Band leader invitations, sent by admins (#22).
export const listLeaderInvitations = (deps: InvitationDeps) =>
  listInvitations(deps, LEADER_INVITATIONS);
export const inviteLeader = (
  deps: InvitationDeps,
  input: { email: string; language: Language; invitedById: string },
) => invite(deps, LEADER_INVITATIONS, input);
export const resendLeaderInvitation = (deps: InvitationDeps, id: string, actorId: string) =>
  resendInvitation(deps, LEADER_INVITATIONS, id, actorId);
export const revokeLeaderInvitation = (deps: InvitationDeps, id: string, actorId: string) =>
  revokeInvitation(deps, LEADER_INVITATIONS, id, actorId);
