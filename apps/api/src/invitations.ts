import type { Language } from "@coverband/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { invitations, users } from "./db/schema";
import type { Mailer } from "./mail/mailer";
import { leaderInvitationEmail } from "./mail/templates";

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

export class AlreadyInvitedError extends Error {
  constructor(email: string) {
    super(`${email} already has a pending invitation`);
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

/** Open leader invitations (neither accepted nor revoked), newest first, with their status. */
export async function listLeaderInvitations({ db, now = () => new Date() }: InvitationDeps) {
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
    .where(
      and(
        eq(invitations.role, "leader"),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .orderBy(desc(invitations.createdAt));
  const at = now();
  return rows.map(({ acceptedAt, revokedAt, ...row }) => ({
    ...row,
    status: invitationStatus({ acceptedAt, revokedAt, expiresAt: row.expiresAt }, at),
  }));
}

async function sendLeaderInvitation(
  deps: InvitationDeps,
  invitation: { email: string; language: Language; invitedById: string },
  token: string,
) {
  const [inviter] = await deps.db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invitation.invitedById));
  await deps.mailer.send(
    leaderInvitationEmail(invitation.email, invitation.language, {
      inviterName: inviter?.name ?? "CoverBand",
      url: invitationUrl(deps.appUrl, token),
    }),
  );
}

/**
 * Invites someone to become a band leader. The email may already have an account: that user will
 * only create a band (#23). One open, unexpired leader invitation per email.
 */
export async function inviteLeader(
  deps: InvitationDeps,
  input: { email: string; language: Language; invitedById: string },
) {
  const now = deps.now?.() ?? new Date();
  const email = input.email.trim().toLowerCase();
  const { token, tokenHash } = newToken();

  const invitation = await deps.db.transaction(async (tx) => {
    // Serializes concurrent invitations of the same email.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invite:${email}`}))`);
    const open = await tx
      .select({ expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.role, "leader"),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    if (open.some((row) => row.expiresAt > now)) {
      throw new AlreadyInvitedError(email);
    }
    const [created] = await tx
      .insert(invitations)
      .values({
        email,
        role: "leader",
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
    await sendLeaderInvitation(deps, invitation, token);
  } catch (error) {
    // Not sent: drop it so the admin can simply try again.
    await deps.db.delete(invitations).where(eq(invitations.id, invitation.id));
    throw error;
  }
  return invitation;
}

/** Sends a new link valid for another 48 hours; the previous link stops working. */
export async function resendLeaderInvitation(deps: InvitationDeps, id: string) {
  const now = deps.now?.() ?? new Date();
  const { token, tokenHash } = newToken();
  const [invitation] = await deps.db
    .update(invitations)
    .set({ tokenHash, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.role, "leader"),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning();
  if (!invitation) return null;
  await sendLeaderInvitation(deps, invitation, token);
  return invitation;
}

/** Revokes an open invitation: its link stops working. Returns false if there was none. */
export async function revokeLeaderInvitation(deps: InvitationDeps, id: string) {
  const now = deps.now?.() ?? new Date();
  const revoked = await deps.db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.role, "leader"),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  return revoked.length > 0;
}
