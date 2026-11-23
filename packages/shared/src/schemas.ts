// Request bodies of the API, as Zod schemas: the API validates with them, and the web app can
// check a form with the same rules. A separate entry (`@coverband/shared/schemas`), so Zod only
// reaches the web bundle where it is imported.

import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth";
import { FIELD_MAX_LENGTH } from "./bands";
import { CONTACT_MESSAGE, CONTACT_SUBJECTS } from "./contact";
import { DOCUMENT_LIMITS } from "./documents";
import { MAX_SONG_DURATION } from "./duration";
import {
  BAND_CONTACT_MAX_LENGTH,
  BAND_CONTACT_TYPES,
  GIG_LIMITS,
  GIG_MAX_LENGTH,
  GIG_POSTER_LIMITS,
  GIG_TYPES,
  isGigDate,
  isTimeOfDay,
  VENUE_LIMITS,
  VENUE_MAX_LENGTH,
} from "./gigs";
import { MAX_INSTRUMENTS } from "./instruments";
import { MUSICAL_KEYS } from "./keys";
import { LANGUAGES, type Language } from "./languages";
import { MEDIA_LIMITS, parseMediaUrl } from "./media";
import { NOTIFICATION_TEXT_MAX_LENGTH } from "./notifications";
import { SETLIST_LIMITS, SETLIST_MAX_LENGTH } from "./setlists";
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

/** A note from the app's team, sent by an admin to every user (#260): plain text. */
export const teamNoteBody = z.object({
  text: z.string().trim().min(1).max(NOTIFICATION_TEXT_MAX_LENGTH),
});

/** A browser's push subscription (#261), as `PushSubscription.toJSON()` gives it. */
export const pushSubscriptionBody = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({
    p256dh: z.base64url().max(200),
    auth: z.base64url().max(100),
  }),
  // The app's language on the device (#262): pushes are written in it.
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]).default("en"),
});

/** Turning push notifications off on a device: its subscription's endpoint. */
export const pushEndpointBody = z.object({ endpoint: z.string().max(2000) });

/** A new setlist, or a new title: unique within the band, case ignored (409 setlist_title_taken). */
export const setlistTitleBody = z.object({ title: text(SETLIST_MAX_LENGTH.title) });

/**
 * A setlist's whole content (#272): its parts in order, each with an optional name and its songs
 * in order (song ids; the same song may appear twice). `version` is the one it was read at: a
 * save on an older version is refused (409 setlist_outdated).
 */
export const setlistContentBody = z.object({
  version: z.number().int().min(1),
  parts: z
    .array(
      z.object({
        name: optionalText(SETLIST_MAX_LENGTH.partName),
        songs: z.array(z.uuid()).max(SETLIST_LIMITS.songs),
      }),
    )
    .min(1)
    .max(SETLIST_LIMITS.parts)
    .refine(
      (parts) =>
        parts.reduce((total, part) => total + part.songs.length, 0) <= SETLIST_LIMITS.songs,
      { message: `At most ${SETLIST_LIMITS.songs} songs in a setlist` },
    ),
});

/** A web link (a venue's, a gig's program): an http(s) address and an optional title. */
export const webLinkInput = z.object({
  url: z
    .string()
    .trim()
    .max(VENUE_MAX_LENGTH.url)
    .refine((value) => parseMediaUrl(value) !== null, { message: "Not a web address" }),
  title: optionalText(VENUE_MAX_LENGTH.linkTitle).default(null),
});

/** Contacts linked to a gig or a venue (#329): the band's contacts' ids; absent, unchanged. */
const contactIds = z.array(z.uuid()).max(GIG_LIMITS.contacts).optional();

/** A venue's details (brief 034): name and city required, unique within the band. */
export const venueBody = z.object({
  name: text(VENUE_MAX_LENGTH.name),
  city: text(VENUE_MAX_LENGTH.city),
  address: optionalText(VENUE_MAX_LENGTH.address).default(null),
  links: z.array(webLinkInput).max(VENUE_LIMITS.links).default([]),
  description: optionalText(VENUE_MAX_LENGTH.description).default(null),
  // Its usual people (#329), shown on every gig there.
  contactIds,
  // Its pin dragged on the map (#333): kept for its address. Absent: found from the address.
  coordinates: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .optional(),
});

/** A band's contact (#329): name and type required; phone, email and notes optional. */
export const bandContactBody = z.object({
  name: text(BAND_CONTACT_MAX_LENGTH.name),
  type: z.enum(BAND_CONTACT_TYPES),
  phone: optionalText(BAND_CONTACT_MAX_LENGTH.phone).default(null),
  email: z
    .string()
    .trim()
    .max(BAND_CONTACT_MAX_LENGTH.email)
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Not an email address",
    })
    .nullable()
    .default(null)
    .transform((value) => value || null),
  notes: optionalText(BAND_CONTACT_MAX_LENGTH.notes).default(null),
});

/** A date as `YYYY-MM-DD`. */
const gigDate = z.string().refine(isGigDate, { message: "Not a date" });
/** A time of day as `HH:MM`, or none. */
const timeOfDay = z
  .string()
  .refine((value) => value === "" || isTimeOfDay(value), { message: "Not a time" })
  .nullable()
  .transform((value) => value || null);

/**
 * A gig's venue in its form: the band's venue (`id`, its details as edited: they change for
 * every gig there), or a new one (no `id`), saved with the gig.
 */
export const gigVenueInput = venueBody.extend({ id: z.uuid().optional() });

/** A gig's main details (brief 034): a date, and a title or a venue, or both. */
const gigFields = z.object({
  date: gigDate,
  title: optionalText(GIG_MAX_LENGTH.title).default(null),
  type: z.enum(GIG_TYPES).default("public"),
  showTime: timeOfDay.default(null),
  venue: gigVenueInput.nullable().default(null),
  // Its setlist, program and extra info (#328).
  setlistId: z.uuid().nullable().default(null),
  getInTime: timeOfDay.default(null),
  programLinks: z.array(webLinkInput).max(GIG_LIMITS.programLinks).default([]),
  programNotes: optionalText(GIG_MAX_LENGTH.programNotes).default(null),
  payCents: z.number().int().min(0).max(GIG_LIMITS.payCents).nullable().default(null),
  payNotes: optionalText(GIG_MAX_LENGTH.payNotes).default(null),
  sharedBackline: z.boolean().default(false),
  backlineNotes: optionalText(GIG_MAX_LENGTH.backlineNotes).default(null),
  techniciansProvided: z.boolean().default(false),
  notes: optionalText(GIG_MAX_LENGTH.notes).default(null),
  // Its own contacts (#329), after its venue's.
  contactIds,
});

const titleOrVenue = (gig: { title: string | null; venue: unknown }) =>
  gig.title !== null || gig.venue !== null;
const titleOrVenueMessage = { message: "A gig needs a title or a venue", path: ["title"] };

/** A new gig. */
export const gigBody = gigFields.refine(titleOrVenue, titleOrVenueMessage);

/** A gig's changes, read at `version`: a save on an older one is refused (409 gig_outdated). */
export const gigUpdateBody = gigFields
  .extend({ version: z.number().int().min(1) })
  .refine(titleOrVenue, titleOrVenueMessage);

/** A gig's new poster (#330), a multipart form: the image (its type read from its bytes), a title. */
export const addPosterBody = z.object({
  file: z.instanceof(File),
  title: text(GIG_POSTER_LIMITS.title),
});

/**
 * Merging two of the band's contacts (#334), the same person entered twice: `from` is deleted,
 * its gigs and venues listing the kept contact instead, whose details become `details`.
 */
export const mergeContactsBody = z.object({ from: z.uuid(), details: bandContactBody });

/** Cancelling a gig (#327): the reason, kept with the gig and shown at its top. */
export const gigCancelBody = z.object({ reason: text(GIG_MAX_LENGTH.cancelReason) });
