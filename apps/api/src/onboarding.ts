import { displayName, type ErrorCode, slugify } from "@coverband/shared";
import { eq, sql } from "drizzle-orm";
import type { AppDeps } from "./app";
import type { SessionUser } from "./auth";
import { accounts, bandMembers, bands, invitations, users } from "./db/schema";
import { hashToken, invitationStatus } from "./invitations";

/** An expected refusal, turned into an API error with a stable code. */
export class OnboardingError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Deps = Pick<AppDeps, "db" | "auth"> & { now?: () => Date };

const PROBLEMS = {
  expired: new OnboardingError(410, "invitation_expired", "Invitation expired"),
  revoked: new OnboardingError(410, "invitation_revoked", "Invitation revoked"),
  accepted: new OnboardingError(410, "invitation_used", "Invitation already used"),
} as const;

const notFound = () => new OnboardingError(404, "invitation_not_found", "Invitation not found");

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
  if (status !== "pending") throw PROBLEMS[status];

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

export async function isBandNameAvailable({ db }: Pick<Deps, "db">, name: string) {
  const [taken] = await db
    .select({ id: bands.id })
    .from(bands)
    .where(eq(sql`lower(${bands.name})`, name.trim().toLowerCase()));
  return taken === undefined;
}

export type LeaderOnboardingInput = {
  instrument: string;
  bandName: string;
  genre?: string | undefined;
  /** Only for someone without an account yet. */
  newAccount?:
    | { firstName: string; lastName: string; nickname?: string | undefined; password: string }
    | undefined;
};

/**
 * Accepts a band leader invitation: creates the account (if needed), the band and the leader
 * membership, and consumes the invitation, all in one transaction. Someone who already has an
 * account must be logged in with it.
 */
export async function acceptLeaderInvitation(
  deps: Deps,
  token: string,
  input: LeaderOnboardingInput,
  sessionUser: SessionUser | null,
) {
  const now = deps.now?.() ?? new Date();
  const passwordHash = input.newAccount
    ? await (await deps.auth.$context).password.hash(input.newAccount.password)
    : null;

  try {
    return await createLeader(deps, token, input, sessionUser, now, passwordHash);
  } catch (error) {
    // Two people creating the same band name at the same moment: the unique index decides.
    if (isUniqueViolation(error, "bands_name_lower_unique")) {
      throw new OnboardingError(409, "band_name_taken", "Band name already taken");
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } })?.cause;
  return cause?.code === "23505" && cause.constraint_name === constraint;
}

function createLeader(
  deps: Deps,
  token: string,
  input: LeaderOnboardingInput,
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
    if (status !== "pending") throw PROBLEMS[status];
    if (invitation.role !== "leader") throw notFound();

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email));

    let userId: string;
    if (existing) {
      if (!sessionUser) {
        throw new OnboardingError(401, "unauthorized", "Log in to accept this invitation");
      }
      if (sessionUser.id !== existing.id) {
        throw new OnboardingError(403, "invitation_wrong_account", "Logged in as someone else");
      }
      userId = existing.id;
    } else {
      if (sessionUser) {
        throw new OnboardingError(403, "invitation_wrong_account", "Logged in as someone else");
      }
      if (!input.newAccount || !passwordHash) {
        throw new OnboardingError(400, "bad_request", "Profile and password are required");
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
    }

    const bandName = input.bandName.trim();
    const [taken] = await tx
      .select({ id: bands.id })
      .from(bands)
      .where(eq(sql`lower(${bands.name})`, bandName.toLowerCase()));
    if (taken) {
      throw new OnboardingError(409, "band_name_taken", "Band name already taken");
    }
    const slug = await freeSlug(tx, slugify(bandName));
    const [band] = await tx
      .insert(bands)
      .values({ name: bandName, slug, genre: input.genre?.trim() || null })
      .returning({ id: bands.id, slug: bands.slug });
    if (!band) throw new Error("Band insert returned nothing");

    await tx
      .insert(bandMembers)
      .values({ bandId: band.id, userId, role: "leader", instrument: input.instrument.trim() });
    await tx
      .update(invitations)
      .set({ acceptedAt: now, bandId: band.id })
      .where(eq(invitations.id, invitation.id));

    return { userId, email: invitation.email, bandSlug: band.slug, newAccount: !existing };
  });
}

type Tx = Parameters<Parameters<Deps["db"]["transaction"]>[0]>[0];

/** The slug itself if free, else slug-2, slug-3... (two names can give the same slug). */
async function freeSlug(tx: Tx, base: string): Promise<string> {
  const rows = await tx
    .select({ slug: bands.slug })
    .from(bands)
    .where(sql`${bands.slug} = ${base} or ${bands.slug} like ${`${base}-%`}`);
  const used = new Set(rows.map((row) => row.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}
