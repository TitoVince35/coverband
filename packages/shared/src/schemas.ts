// Request bodies of the API, as Zod schemas: the API validates with them, and the web app can
// check a form with the same rules. A separate entry (`@coverband/shared/schemas`), so Zod only
// reaches the web bundle where it is imported.

import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth";
import { FIELD_MAX_LENGTH } from "./bands";
import { MAX_SONG_DURATION } from "./duration";
import { MAX_INSTRUMENTS } from "./instruments";
import { MUSICAL_KEYS } from "./keys";
import { LANGUAGES, type Language } from "./languages";
import { MEDIA_LIMITS, parseMediaUrl } from "./media";
import { MAX_ENERGY, SONG_MAX_LENGTH, SONG_STATUSES, SONG_TEMPO } from "./songs";

/** Required text, trimmed. */
const text = (max: number) => z.string().trim().min(1).max(max);

/** Optional text: blank is null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** An instrument as typed: a known code or free text (checked and tidied when stored). */
export const instrumentInput = z.union([
  z.object({ code: z.string().max(50) }),
  z.object({ label: z.string().max(FIELD_MAX_LENGTH.instrument) }),
]);

const instrumentList = z.array(instrumentInput).max(MAX_INSTRUMENTS);

/** An invitation: the email, and the language of the email sent. */
export const invitationBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

/** Accepting an invitation, the wizard's last step. */
export const acceptInvitationBody = z.object({
  /** Optional main instrument. */
  instrument: instrumentInput.optional(),
  /** Band leaders: the band they create. */
  bandName: text(FIELD_MAX_LENGTH.bandName).optional(),
  genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).optional(),
  /** Someone without an account yet. */
  newAccount: z
    .object({
      firstName: text(FIELD_MAX_LENGTH.firstName),
      lastName: text(FIELD_MAX_LENGTH.lastName),
      nickname: z.string().trim().max(FIELD_MAX_LENGTH.nickname).optional(),
      password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    })
    .optional(),
});

/** A band name to check, while creating a band. */
export const bandNameQuery = z.object({ name: text(FIELD_MAX_LENGTH.bandName) });

/** A band's changes: only the genre, a band name is forever (it is also the band's URL). */
export const bandBody = z.object({
  genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).nullable(),
});

/** A member's own instruments in a band. */
export const instrumentsBody = z.object({ instruments: instrumentList });

/** The logged-in user's profile. */
export const profileBody = z.object({
  firstName: text(FIELD_MAX_LENGTH.firstName),
  lastName: text(FIELD_MAX_LENGTH.lastName),
  nickname: z.string().trim().max(FIELD_MAX_LENGTH.nickname).optional(),
});

const duration = z.number().int().min(0).max(MAX_SONG_DURATION).nullable();
const key = z.enum(MUSICAL_KEYS).nullable();

const songFields = z.object({
  title: text(SONG_MAX_LENGTH.title),
  artist: text(SONG_MAX_LENGTH.artist),
  standardDuration: duration,
  ownDuration: duration,
  key,
  bandKey: key,
  tempo: z.number().int().min(SONG_TEMPO.min).max(SONG_TEMPO.max).nullable(),
  style: optionalText(SONG_MAX_LENGTH.style),
  notes: optionalText(SONG_MAX_LENGTH.notes),
  status: z.enum(SONG_STATUSES),
  energy: z.number().int().min(1).max(MAX_ENERGY).nullable(),
});

// A song matching one of the repertoire is refused (409 song_duplicate) unless confirmed.
const confirm = { confirmDuplicate: z.boolean().optional() };

/** A new song: title, artist and durations; the details are optional. */
export const addSongBody = songFields
  .partial({
    key: true,
    bandKey: true,
    tempo: true,
    style: true,
    notes: true,
    status: true,
    energy: true,
  })
  .extend(confirm);

/** Some of a song's fields. */
export const updateSongBody = songFields.partial().extend(confirm);

const mediaFields = z.object({
  url: z
    .string()
    .trim()
    .max(MEDIA_LIMITS.url)
    .refine((url) => parseMediaUrl(url) !== null, "Not an http(s) URL"),
  title: optionalText(MEDIA_LIMITS.title),
  instruments: instrumentList,
});

/** A song's new link: an http(s) URL, an optional title and instruments. */
export const addMediaBody = mediaFields.partial({ title: true, instruments: true });

/** Some of a link's fields. */
export const updateMediaBody = mediaFields.partial();
