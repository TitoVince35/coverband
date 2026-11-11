import { type ActivityAction, SONG_STATUSES, type SongStatus } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/i18n/use-language";
import { bandJournalQuery } from "@/lib/bands";
import { errorMessage, replacesData } from "@/lib/errors";
import { formatJournalTime } from "@/lib/format";
import { LINK_MARKER, splitAtMarker } from "@/lib/journal";
import { cn } from "@/lib/utils";

/** Sentence of each band event. An action without one (added later) isn't shown yet. */
const SENTENCES = {
  "band.created": "journal.bandCreated",
  "member.joined": "journal.memberJoined",
  "band.genre_changed": "journal.genreChanged",
  "band.logo_changed": "journal.logoChanged",
  "invitation.sent": "journal.invitationSent",
  "invitation.resent": "journal.invitationResent",
  "invitation.revoked": "journal.invitationRevoked",
  "member.instruments_changed": "journal.instrumentsChanged",
  "song.added": "journal.songAdded",
  "song.updated": "journal.songUpdated",
  "song.status_changed": "journal.songStatusChanged",
  "song.archived": "journal.songArchived",
  "song.restored": "journal.songRestored",
  "song.deleted": "journal.songDeleted",
  "song.lyrics_changed": "journal.songLyricsChanged",
  "song.document_added": "journal.documentAdded",
  "song.document_removed": "journal.documentRemoved",
  "setlist.created": "journal.setlistCreated",
  "setlist.renamed": "journal.setlistRenamed",
  "setlist.archived": "journal.setlistArchived",
  "setlist.restored": "journal.setlistRestored",
  "setlist.deleted": "journal.setlistDeleted",
  "setlist.updated": "journal.setlistUpdated",
} as const satisfies Partial<Record<ActivityAction, string>>;

/** The status a song was given, as a word of the sentence. */
const isStatus = (value: unknown): value is SongStatus =>
  typeof value === "string" && (SONG_STATUSES as readonly string[]).includes(value);

const hasSentence = (action: string): action is keyof typeof SENTENCES => action in SENTENCES;

/** A journal entry, as the API sends it (the band's journal, a song's history). */
export type JournalEntry = NonNullable<
  Awaited<ReturnType<ReturnType<typeof bandJournalQuery>["queryFn"] & {}>>
>[number];

/**
 * The band's latest activity, newest first, one sentence each (#84): a fixed height cut by a
 * fade, then "View more" to see the rest in place (#285).
 */
export function BandJournal({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const journal = useQuery(bandJournalQuery(bandSlug));
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Whether the entries go past the fixed height, measured again when the card's width changes.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("journal.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {journal.isPending ? (
          <ListSkeleton rows={3} />
        ) : journal.data === undefined || replacesData(journal.error) ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, journal.error)}
          </p>
        ) : (
          <>
            <div ref={box} className={cn("relative", !expanded && "max-h-44 overflow-hidden")}>
              <JournalList bandSlug={bandSlug} entries={journal.data} label={t("journal.title")} />
              {!expanded && overflows && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card"
                />
              )}
            </div>
            {!expanded && overflows && (
              <Button variant="link" className="mt-1 h-auto px-0" onClick={() => setExpanded(true)}>
                {t("journal.more")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Journal entries, one sentence each with its date, told apart by a thin divider (#285); a
 * song or setlist that still exists is a link to its page.
 */
export function JournalList({
  bandSlug,
  entries,
  label,
}: {
  bandSlug: string;
  entries: readonly JournalEntry[];
  label: string;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const now = new Date();
  const words = { yesterday: t("journal.yesterday") };
  const shown = entries.filter((entry) => hasSentence(entry.action));
  const statusWord = (entry: object) =>
    "status" in entry && isStatus(entry.status) ? t(`journal.status.${entry.status}`) : "";

  if (shown.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("journal.empty")}</p>;
  }
  return (
    <ul className="divide-y text-sm" aria-label={label}>
      {shown.map((entry) => {
        if (!hasSentence(entry.action)) return null; // narrows the action's type
        const name = entry.actorName ?? t("journal.someone");
        // The song's or setlist's current title; "a song" once it's gone.
        const songTitle = "song" in entry ? entry.song : null;
        const setlistTitle = "setlist" in entry ? entry.setlist : null;
        const linkText = songTitle
          ? t("journal.songTitle", { title: songTitle })
          : setlistTitle
            ? t("journal.setlistTitle", { title: setlistTitle })
            : null;
        // Linked when it still exists (an archived one too): the marker stands in its place.
        const linked = linkText !== null && entry.target !== null;
        const song = songTitle
          ? linked && entry.target?.type === "song"
            ? LINK_MARKER
            : t("journal.songTitle", { title: songTitle })
          : t("journal.aSong");
        const setlist = setlistTitle
          ? linked && entry.target?.type === "setlist"
            ? LINK_MARKER
            : t("journal.setlistTitle", { title: setlistTitle })
          : t("journal.aSetlist");
        const sentence =
          entry.action === "band.genre_changed" && !("genre" in entry && entry.genre)
            ? t("journal.genreRemoved", { name })
            : entry.action === "band.logo_changed" && "logo" in entry && entry.logo === "removed"
              ? t("journal.logoRemoved", { name })
              : t(SENTENCES[entry.action], {
                  name,
                  genre: "genre" in entry ? entry.genre : "",
                  song,
                  setlist,
                  status: statusWord(entry),
                });
        const parts = splitAtMarker(sentence);
        let text: ReactNode = sentence;
        if (parts && entry.target && linkText) {
          const link =
            entry.target.type === "song" ? (
              <Link
                to="/b/$bandSlug/songs/$songId"
                params={{ bandSlug, songId: entry.target.id }}
                className="font-medium underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
              >
                {linkText}
              </Link>
            ) : (
              <Link
                to="/b/$bandSlug/setlists/$setlistId"
                params={{ bandSlug, setlistId: entry.target.id }}
                className="font-medium underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
              >
                {linkText}
              </Link>
            );
          text = (
            <>
              {parts[0]}
              {link}
              {parts[1]}
            </>
          );
        }
        return (
          <li key={entry.id} className="py-2 first:pt-0">
            <time dateTime={entry.createdAt} className="text-muted-foreground tabular-nums">
              {formatJournalTime(entry.createdAt, now, language, words)}
            </time>{" "}
            · {text}
          </li>
        );
      })}
    </ul>
  );
}
