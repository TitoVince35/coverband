// Request bodies of the API, as Zod schemas: the API validates with them, and the web app can
// check a form with the same rules. A separate entry (`@coverband/shared/schemas`), so Zod only
// reaches the web bundle where it is imported.

import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth";
import { FIELD_MAX_LENGTH } from "./bands";
import { CONTACT_MESSAGE, CONTACT_SUBJECTS } from "./contact";
import { DOCUMENT_LIMITS } from "./documents";
import { MAX_SONG_DURATION } from "./duration";
import { MAX_INSTRUMENTS } from "./instruments";
import { MUSICAL_KEYS } from "./keys";
import { LANGUAGES, type Language } from "./languages";
import { MEDIA_LIMITS, parseMediaUrl } from "./media";
import { LYRICS_SOURCES, MAX_ENERGY, SONG_MAX_LENGTH, SONG_STATUSES, SONG_TEMPO } from "./songs";

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
/** The beta access code (#148). */
export const accessCodeBody = z.object({ code: z.string().min(1).max(200) });

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

/**
 * A band's new logo (multipart form): the logo and its thumbnail, prepared by the browser. The API
 * checks the files' formats and sizes itself.
 */
export const logoUploadBody = z.object({
  logo: z.instanceof(File),
  thumbnail: z.instanceof(File),
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
  lyrics: optionalText(SONG_MAX_LENGTH.lyrics),
  lyricsSource: z.enum(LYRICS_SOURCES).nullable(),
  status: z.enum(SONG_STATUSES),
  energy: z.number().int().min(1).max(MAX_ENERGY).nullable(),
});

// A song matching one of the repertoire is refused (409 song_duplicate) unless confirmed.
const confirm = { confirmDuplicate: z.boolean().optional() };

/** A new song: title, artist and durations; the details are optional. */
export const addSongBody = songFields
  .partial({
    // Adding asks for the title and artist only (#188): the rest is filled in on the song's page.
    standardDuration: true,
    ownDuration: true,
    key: true,
    bandKey: true,
    tempo: true,
    style: true,
    notes: true,
    lyrics: true,
    lyricsSource: true,
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

/**
 * A message to the app's team (#234). `page`: where the user came from, sent with a bug report
 * (the server adds the version and the browser).
 */
export const contactBody = z.object({
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(CONTACT_MESSAGE.min).max(CONTACT_MESSAGE.max),
  page: z.string().trim().startsWith("/").max(500).optional(),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

/**
 * A song's new document (#238), a multipart form: the file (its type is read from its bytes and
 * name), a title, and its instruments as JSON (a form field is text).
 */
export const addDocumentBody = z.object({
  file: z.instanceof(File),
  title: z.string().trim().min(1).max(DOCUMENT_LIMITS.title),
  instruments: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return [];
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Not JSON" });
        return z.NEVER;
      }
    })
    .pipe(instrumentList),
});

/** A document's title and instruments; its file never changes. */
export const updateDocumentBody = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_LIMITS.title),
    instruments: instrumentList,
  })
  .partial();
