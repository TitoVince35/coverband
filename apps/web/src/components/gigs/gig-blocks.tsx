import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, ListOrdered, MonitorPlay } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { linkLabel } from "@/components/gigs/web-links-editor";
import { songsDuration } from "@/components/setlists/setlist-duration";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/use-language";
import { formatPay } from "@/lib/gig-rules";
import type { Gig } from "@/lib/gigs";
import { enterFullscreen } from "@/lib/live";
import { setlistQuery } from "@/lib/setlists";

/** A compact view's block, a card: its title, then its content. */
export function GigBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="font-heading font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The gig's setlist (#328): headed "Setlist" (#357: its title is the gig's own name), its songs,
 * its parts when more than one, its duration, and Live (the live mode, offline too), from the
 * setlist's own query (kept offline).
 */
export function GigSetlistCard({ bandSlug, setlistId }: { bandSlug: string; setlistId: string }) {
  const { t } = useTranslation();
  const setlist = useQuery(setlistQuery(bandSlug, setlistId)).data;
  if (!setlist) return null;
  const songs = setlist.parts.flatMap((part) => part.songs);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <ListOrdered aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <Link
        to="/b/$bandSlug/setlists/$setlistId"
        params={{ bandSlug, setlistId }}
        className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block font-semibold">{t("gigs.setlist.title")}</span>
        <span className="block text-muted-foreground text-sm">
          {[
            t("setlists.songCount", { count: songs.length }),
            setlist.parts.length > 1 && t("setlists.partCount", { count: setlist.parts.length }),
            songsDuration(t, songs),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </Link>
      <Button asChild size="sm">
        <Link
          to="/b/$bandSlug/setlists/$setlistId/live"
          params={{ bandSlug, setlistId }}
          onClick={enterFullscreen}
        >
          <MonitorPlay />
          {t("setlists.live.button")}
        </Link>
      </Button>
    </div>
  );
}

/** The gig's program (#328): its web links and its text. */
export function GigProgram({ gig }: { gig: Gig }) {
  const { t } = useTranslation();
  if (gig.programLinks.length === 0 && !gig.programNotes) return null;
  return (
    <GigBlock title={t("gigs.program.title")}>
      {gig.programLinks.length > 0 && (
        <ul className="space-y-1">
          {gig.programLinks.map((link) => (
            <li key={link.url} className="flex min-w-0 items-center gap-2">
              <ExternalLink aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-primary text-sm underline-offset-4 hover:underline"
              >
                {linkLabel(link)}
              </a>
            </li>
          ))}
        </ul>
      )}
      {gig.programNotes && (
        <p className="whitespace-pre-line break-words text-sm">{gig.programNotes}</p>
      )}
    </GigBlock>
  );
}

/**
 * "Good to know" (#328): the pay (every member sees it), the shared backline, technicians
 * provided, then the notes. Nothing when none is filled in.
 */
export function GoodToKnow({ gig }: { gig: Gig }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const facts = [
    gig.payCents !== null
      ? [formatPay(gig.payCents, language), gig.payNotes].filter(Boolean).join(" · ")
      : gig.payNotes,
    // With what it has: on its own lines below, as typed.
    gig.sharedBackline && !gig.backlineNotes ? t("gigs.extras.sharedBackline") : null,
    gig.techniciansProvided ? t("gigs.extras.technicians") : null,
  ].filter((fact): fact is string => Boolean(fact));
  const backline = gig.sharedBackline ? gig.backlineNotes : null;
  if (facts.length === 0 && !backline && !gig.notes) return null;
  return (
    <GigBlock title={t("gigs.extras.goodToKnow")}>
      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <li
              key={fact}
              className="break-words rounded-4xl border bg-background px-3 py-1 text-sm"
            >
              {fact}
            </li>
          ))}
        </ul>
      )}
      {backline && (
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{t("gigs.extras.sharedBackline")}</p>
          <p className="whitespace-pre-line break-words text-muted-foreground">{backline}</p>
        </div>
      )}
      {gig.notes && (
        <p className="whitespace-pre-line break-words text-muted-foreground text-sm">{gig.notes}</p>
      )}
    </GigBlock>
  );
}
