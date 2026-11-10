import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SetlistMenu } from "@/components/setlists/setlist-menu";
import { useLanguage } from "@/i18n/use-language";
import { formatDate } from "@/lib/format";
import type { SetlistSummary } from "@/lib/setlists";
import { cn } from "@/lib/utils";

/** The setlists page's two tabs: the current setlists and the archived ones (#271). */
export function SetlistTabs({
  bandSlug,
  current,
  archived,
}: {
  bandSlug: string;
  current: "current" | "archived";
  archived: number | undefined;
}) {
  const { t } = useTranslation();
  const tab = (active: boolean) =>
    cn(
      "flex h-9 items-center justify-center gap-1.5 rounded-4xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-background font-semibold shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav
      aria-label={t("setlists.title")}
      className="grid grid-cols-2 gap-1 rounded-4xl bg-muted p-1"
    >
      <Link
        to="/b/$bandSlug/setlists"
        params={{ bandSlug }}
        activeOptions={{ exact: true }}
        aria-current={current === "current" ? "page" : undefined}
        className={tab(current === "current")}
      >
        {t("setlists.current")}
      </Link>
      <Link
        to="/b/$bandSlug/setlists/archived"
        params={{ bandSlug }}
        aria-current={current === "archived" ? "page" : undefined}
        className={tab(current === "archived")}
      >
        {t("setlists.archived")}
        {archived !== undefined && archived > 0 && (
          <span className="text-muted-foreground tabular-nums">{archived}</span>
        )}
      </Link>
    </nav>
  );
}

/** Setlists as cards: the title opens the setlist, the menu holds its actions. */
export function SetlistList({
  bandSlug,
  setlists,
}: {
  bandSlug: string;
  setlists: readonly SetlistSummary[];
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  return (
    <ul className="space-y-2" aria-label={t("setlists.title")}>
      {setlists.map((setlist) => (
        <li
          key={setlist.id}
          className={cn(
            "flex items-center rounded-xl border bg-card",
            setlist.archivedAt && "border-dashed",
          )}
        >
          <Link
            to="/b/$bandSlug/setlists/$setlistId"
            params={{ bandSlug, setlistId: setlist.id }}
            className="min-w-0 flex-1 space-y-1 rounded-xl py-3 pl-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="truncate font-semibold">{setlist.title}</p>
            <p className="truncate text-muted-foreground text-xs">
              {setlist.archivedAt
                ? t("setlists.archivedOn", { date: formatDate(setlist.archivedAt, language) })
                : t("setlists.byChanged", {
                    name: setlist.createdBy ?? t("journal.someone"),
                    date: formatDate(setlist.updatedAt, language),
                  })}
            </p>
          </Link>
          <div className="px-1">
            <SetlistMenu bandSlug={bandSlug} setlist={setlist} onDeleted={() => {}} />
          </div>
        </li>
      ))}
    </ul>
  );
}
