import type { ActivityAction } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/i18n/use-language";
import { bandJournalQuery } from "@/lib/bands";
import { errorMessage } from "@/lib/errors";
import { formatJournalTime } from "@/lib/format";

/** Sentence of each band event. An action without one (added later) isn't shown yet. */
const SENTENCES = {
  "band.created": "journal.bandCreated",
  "member.joined": "journal.memberJoined",
  "band.genre_changed": "journal.genreChanged",
  "invitation.sent": "journal.invitationSent",
  "invitation.resent": "journal.invitationResent",
  "invitation.revoked": "journal.invitationRevoked",
  "member.instruments_changed": "journal.instrumentsChanged",
  "song.added": "journal.songAdded",
  "song.updated": "journal.songUpdated",
} as const satisfies Partial<Record<ActivityAction, string>>;

const hasSentence = (action: string): action is keyof typeof SENTENCES => action in SENTENCES;

/** The band's latest activity, newest first, one sentence each (#84). */
export function BandJournal({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const journal = useQuery(bandJournalQuery(bandSlug));
  const now = new Date();
  const words = { today: t("journal.today"), yesterday: t("journal.yesterday") };
  const entries = journal.data?.filter((entry) => hasSentence(entry.action)) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("journal.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {journal.isPending ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : journal.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, journal.error)}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("journal.empty")}</p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {entries.map((entry) => {
              if (!hasSentence(entry.action)) return null; // narrows the action's type
              const name = entry.actorName ?? t("journal.someone");
              // The song's current title; "a song" once it's gone.
              const songTitle = "song" in entry ? entry.song : null;
              const song = songTitle
                ? t("journal.songTitle", { title: songTitle })
                : t("journal.aSong");
              const sentence =
                entry.action === "band.genre_changed" && !("genre" in entry && entry.genre)
                  ? t("journal.genreRemoved", { name })
                  : t(SENTENCES[entry.action], {
                      name,
                      genre: "genre" in entry ? entry.genre : "",
                      song,
                    });
              return (
                <li key={entry.id}>
                  <time dateTime={entry.createdAt} className="text-muted-foreground tabular-nums">
                    {formatJournalTime(entry.createdAt, now, language, words)}
                  </time>{" "}
                  · {sentence}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
