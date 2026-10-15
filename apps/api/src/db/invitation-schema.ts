import { LANGUAGES, type Language } from "@coverband/shared";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { bands } from "./band-schema";

/** Band role the invitation grants: a leader creates a band, a musician joins one (#7). */
export const invitationRole = pgEnum("invitation_role", ["leader", "musician"]);

export const languageEnum = pgEnum("language", Object.keys(LANGUAGES) as [Language, ...Language[]]);

/**
 * Invitations are the only way to get an account. The link carries a random token; only its
 * SHA-256 hash is stored, so a database leak doesn't expose valid links.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid().defaultRandom().primaryKey(),
    email: text().notNull(),
    role: invitationRole().notNull(),
    // Band to join, for musician invitations (#7). Null for leaders, who create their band.
    bandId: uuid().references(() => bands.id, { onDelete: "cascade" }),
    // Language of the email, and default language of the onboarding wizard.
    language: languageEnum().notNull(),
    invitedById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.email)],
);
