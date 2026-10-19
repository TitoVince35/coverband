import type { SessionUser } from "../../adapters/auth";
import { AppError } from "../../core/errors";
import type { AppDeps } from "../../deps";
import { addMember, bandSlugOf, createBand } from "../bands/service";
import { cleanInstruments } from "../instruments/service";
import {
  consumeInvitation,
  lockPendingInvitation,
  pendingInvitation,
} from "../invitations/service";
import { accountIdOf, createAccount } from "../profile/service";

type Deps = Pick<AppDeps, "db" | "auth"> & { now?: () => Date };

/** Public view of an invitation, for the wizard. Throws if it can no longer be used. */
export async function getInvitation({ db, now = () => new Date() }: Deps, token: string) {
  const invitation = await pendingInvitation(db, token, now());
  return {
    email: invitation.email,
    role: invitation.role,
    language: invitation.language,
    inviterName: invitation.inviterName,
    bandName: invitation.bandName,
    hasAccount: (await accountIdOf(db, invitation.email)) !== null,
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
  // Hashed before the transaction: it is slow on purpose.
  const passwordHash = input.newAccount
    ? await (await deps.auth.$context).password.hash(input.newAccount.password)
    : null;

  return deps.db.transaction(async (tx) => {
    const invitation = await lockPendingInvitation(tx, token, now);
    const existingId = await accountIdOf(tx, invitation.email);

    let userId: string;
    if (existingId) {
      if (!sessionUser) {
        throw new AppError("unauthorized", "Log in to accept this invitation");
      }
      if (sessionUser.id !== existingId) {
        throw new AppError("invitation_wrong_account", "Logged in as someone else");
      }
      userId = existingId;
    } else {
      if (sessionUser) {
        throw new AppError("invitation_wrong_account", "Logged in as someone else");
      }
      if (!input.newAccount || !passwordHash) {
        throw new AppError("bad_request", "Profile and password are required");
      }
      const { password: _, ...profile } = input.newAccount;
      userId = await createAccount(
        tx,
        { email: invitation.email, ...profile },
        passwordHash,
        invitation.id,
      );
    }

    let band: { id: string; slug: string };
    if (invitation.role === "leader") {
      if (!input.bandName) {
        throw new AppError("bad_request", "Band name is required");
      }
      band = await createBand(tx, { name: input.bandName, genre: input.genre }, userId);
    } else {
      const slug = invitation.bandId ? await bandSlugOf(tx, invitation.bandId) : null;
      if (!invitation.bandId || !slug) {
        throw new AppError("invitation_not_found", "Invitation not found");
      }
      band = { id: invitation.bandId, slug };
    }

    await addMember(
      tx,
      { bandId: band.id, userId, role: invitation.role },
      input.instrument ? cleanInstruments([input.instrument]) : [],
      invitation.id,
    );
    await consumeInvitation(tx, invitation.id, band.id, now);

    return { userId, email: invitation.email, bandSlug: band.slug, newAccount: !existingId };
  });
}
