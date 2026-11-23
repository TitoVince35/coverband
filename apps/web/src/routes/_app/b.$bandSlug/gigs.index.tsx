import { GIG_FILTERS, type GigFilter } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GigActions } from "@/components/gigs/gig-actions";
import { GigList } from "@/components/gigs/gig-list";
import { GigPagesNav } from "@/components/gigs/gig-pages-nav";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { errorMessage, replacesData } from "@/lib/errors";
import { gigsQuery } from "@/lib/gigs";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

const isFilter = (value: unknown): value is GigFilter =>
  typeof value === "string" && (GIG_FILTERS as readonly string[]).includes(value);

// The band's gigs (brief 034): next (today's and upcoming, the default), past or all, by "A gig's
// day"; any member creates one.
export const Route = createFileRoute("/_app/b/$bandSlug/gigs/")({
  validateSearch: (search: Record<string, unknown>): { when?: GigFilter } =>
    isFilter(search.when) && search.when !== "next" ? { when: search.when } : {},
  component: GigsPage,
});

function GigsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const when = Route.useSearch().when ?? "next";
  const gigs = useQuery(gigsQuery(bandSlug, when));
  const online = useOnline();

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">{t("gigs.title")}</h2>
        {online ? (
          <Button asChild>
            <Link to="/b/$bandSlug/gigs/new" params={{ bandSlug }}>
              <Plus />
              {t("gigs.new.button")}
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Plus />
            {t("gigs.new.button")}
          </Button>
        )}
      </div>
      <GigPagesNav bandSlug={bandSlug} />
      <GigFilterTabs bandSlug={bandSlug} current={when} />
      {when === "past" && (
        <p className="text-center text-muted-foreground text-xs">{t("gigs.pastReadOnly")}</p>
      )}
      {gigs.isPending ? (
        <ListSkeleton rows={4} />
      ) : gigs.data === undefined || replacesData(gigs.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, gigs.error)}
        </p>
      ) : gigs.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t(`gigs.empty.${when}`)}</p>
      ) : (
        <GigList
          bandSlug={bandSlug}
          gigs={gigs.data}
          actions={(gig) => <GigActions bandSlug={bandSlug} gig={gig} withView />}
        />
      )}
    </section>
  );
}

/** Next, Past, All: links, so Back returns to the same filter. */
function GigFilterTabs({ bandSlug, current }: { bandSlug: string; current: GigFilter }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("gigs.filter.label")}
      className="grid grid-cols-3 gap-1 rounded-4xl bg-muted p-1"
    >
      {GIG_FILTERS.map((filter) => (
        <Link
          key={filter}
          to="/b/$bandSlug/gigs"
          params={{ bandSlug }}
          search={filter === "next" ? {} : { when: filter }}
          aria-current={filter === current ? "page" : undefined}
          className={cn(
            "flex h-9 items-center justify-center rounded-4xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filter === current
              ? "bg-background font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`gigs.filter.${filter}`)}
        </Link>
      ))}
    </nav>
  );
}
