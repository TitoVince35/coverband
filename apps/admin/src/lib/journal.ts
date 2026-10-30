import type { ActivityAction } from "@coverband/shared";

/** A band journal entry, as `GET /api/admin/bands/:id` gives it (the web app's journal). */
export type JournalEntry = {
  id: string;
  action: ActivityAction;
  createdAt: string;
  actorName: string | null;
  song?: string | null;
  status?: string | null;
  genre?: string | null;
  logo?: "changed" | "removed";
};

/**
 * Each band event in a sentence, in English (the web app's `journal.*` sentences): `{name}` who
 * did it, `{song}` the song. An action without one (added later) says its code.
 */
const SENTENCES: Partial<Record<ActivityAction, string>> = {
  "band.created": "{name} created the band",
  "member.joined": "{name} joined the band",
  "band.genre_changed": "{name} changed the genre",
  "band.logo_changed": "{name} changed the band's logo",
  "invitation.sent": "{name} invited a musician",
  "invitation.resent": "{name} sent an invitation again",
  "invitation.revoked": "{name} cancelled an invitation",
  "member.instruments_changed": "{name} updated their instruments",
  "song.added": "{name} added {song}",
  "song.updated": "{name} updated {song}",
  "song.status_changed": "{name} marked {song} as {status}",
  "song.archived": "{name} archived {song}",
  "song.restored": "{name} restored {song}",
  "song.deleted": "{name} deleted {song}",
  "song.lyrics_changed": "{name} updated the lyrics of {song}",
  "song.document_added": "{name} added a document to {song}",
  "song.document_removed": "{name} removed a document from {song}",
};

/** The sentence of a journal entry. */
export function journalSentence(entry: JournalEntry) {
  const name = entry.actorName ?? "Someone";
  if (entry.action === "band.genre_changed") {
    return entry.genre
      ? `${name} changed the genre to ${entry.genre}`
      : `${name} removed the genre`;
  }
  if (entry.action === "band.logo_changed" && entry.logo === "removed") {
    return `${name} removed the band's logo`;
  }
  const sentence = SENTENCES[entry.action];
  if (!sentence) return `${name}: ${entry.action}`;
  return sentence
    .replace("{name}", name)
    .replace("{song}", entry.song ? `“${entry.song}”` : "a song")
    .replace("{status}", entry.status ?? "?");
}
