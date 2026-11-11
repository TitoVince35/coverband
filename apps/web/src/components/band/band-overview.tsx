import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ListMusic, ListOrdered, type LucideIcon, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { membersQuery } from "@/lib/bands";
import { archivedSetlistsQuery, setlistsQuery } from "@/lib/setlists";
import { archivedSongsQuery, songsQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

/** The sum of the lists' lengths, or null while one hasn't come yet. */
const total = (...lists: (readonly unknown[] | undefined)[]) =>
  lists.every((list) => list !== undefined)
    ? lists.reduce((sum, list) => sum + (list?.length ?? 0), 0)
    : null;

/**
 * The band's numbers on its home page (#284): songs and setlists (archived ones included),
 * members, and gigs to come (not there yet). Read from what the app already has, offline too;
 * each tile opens its page, with the band tabs' icon.
 */
export function BandOverview({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const songs = useQuery(songsQuery(bandSlug)).data;
  const archivedSongs = useQuery(archivedSongsQuery(bandSlug)).data;
  const setlists = useQuery(setlistsQuery(bandSlug)).data;
  const archivedSetlists = useQuery(archivedSetlistsQuery(bandSlug)).data;
  const members = useQuery(membersQuery(bandSlug)).data;
  const params = { bandSlug };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">{t("overview.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li>
            <Tile icon={ListMusic} count={total(songs, archivedSongs)} label={t("overview.songs")}>
              {(tile) => (
                <Link to="/b/$bandSlug/songs" params={params} className={tileLink}>
                  {tile}
                </Link>
              )}
            </Tile>
          </li>
          <li>
            <Tile
              icon={ListOrdered}
              count={total(setlists, archivedSetlists)}
              label={t("overview.setlists")}
            >
              {(tile) => (
                <Link to="/b/$bandSlug/setlists" params={params} className={tileLink}>
                  {tile}
                </Link>
              )}
            </Tile>
          </li>
          <li>
            <Tile icon={Users} count={total(members)} label={t("overview.members")}>
              {(tile) => (
                <Link to="/b/$bandSlug/lineup" params={params} className={tileLink}>
                  {tile}
                </Link>
              )}
            </Tile>
          </li>
          <li>
            {/* Gigs don't exist yet: a preview, not a link. */}
            <Tile
              icon={CalendarDays}
              count="—"
              label={t("overview.gigs")}
              hint={t("overview.soon")}
            >
              {(tile) => (
                <div aria-disabled className={cn(tileBox, "opacity-60")}>
                  {tile}
                </div>
              )}
            </Tile>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

const tileBox =
  "flex h-full flex-col items-center gap-1 rounded-xl bg-muted/60 px-2 py-3 text-center";
const tileLink = cn(
  tileBox,
  "outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
);

/** A pictogram with the big number over it, the label under it. */
function Tile({
  icon: Icon,
  count,
  label,
  hint,
  children,
}: {
  icon: LucideIcon;
  count: number | string | null;
  label: string;
  hint?: string;
  children: (tile: ReactNode) => ReactNode;
}) {
  return children(
    <>
      <span className="relative flex size-14 items-center justify-center">
        <Icon aria-hidden className="absolute size-14 text-primary opacity-20" strokeWidth={1.5} />
        {count === null ? (
          <Skeleton className="h-8 w-8" />
        ) : (
          <span className="relative font-bold font-heading text-3xl tabular-nums">{count}</span>
        )}
      </span>
      <span className="text-muted-foreground text-sm">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </>,
  );
}
