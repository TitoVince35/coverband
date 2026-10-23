import { Link } from "@tanstack/react-router";
import { CalendarDays, House, ListMusic, ListOrdered, type LucideIcon, Users } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useKeyboardUp } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

type Section = {
  /** null: not there yet, shown disabled. */
  to: "/b/$bandSlug" | "/b/$bandSlug/songs" | "/b/$bandSlug/lineup" | null;
  label: string;
  icon: LucideIcon;
};

/**
 * The band's sections (#223), each with its icon and label: tabs under the band's name on a large
 * screen, a bottom bar on a phone (hidden while its keyboard is up). Setlists and gigs are
 * there already, disabled until they exist: five items, which fit a phone with their labels.
 */
export function BandNav({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const keyboardUp = useKeyboardUp();
  const sections: Section[] = [
    { to: "/b/$bandSlug", label: t("band.home"), icon: House },
    { to: "/b/$bandSlug/songs", label: t("songs.title"), icon: ListMusic },
    { to: "/b/$bandSlug/lineup", label: t("lineup.title"), icon: Users },
    { to: null, label: t("band.nav.setlists"), icon: ListOrdered },
    { to: null, label: t("band.nav.gigs"), icon: CalendarDays },
  ];

  const item = (section: Section, className: string) => {
    const Icon = section.icon;
    const content = (
      <>
        <Icon aria-hidden className="size-5 shrink-0" />
        <span className="truncate">{section.label}</span>
      </>
    );
    if (!section.to) {
      return (
        <span
          key={section.label}
          title={t("band.nav.soon")}
          className={cn(className, "cursor-default opacity-50")}
        >
          {content}
          <span className="sr-only">{t("band.nav.soonSuffix")}</span>
        </span>
      );
    }
    return (
      <Link
        key={section.label}
        to={section.to}
        params={{ bandSlug }}
        // The band's home is only active on itself, not on its sections.
        activeOptions={{ exact: section.to === "/b/$bandSlug" }}
        className={className}
      >
        {content}
      </Link>
    );
  };

  return (
    <>
      {/* TanStack Router marks the current section with data-status="active". */}
      <nav aria-label={t("band.nav.label")} className="hidden gap-4 border-b sm:flex">
        {sections.map((section) =>
          item(
            section,
            "flex items-center gap-1.5 border-transparent border-b-2 px-1 pb-2 text-muted-foreground text-sm hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground",
          ),
        )}
      </nav>
      {/* On the page's body: out of its layout, whose spacing would lift it off the bottom.
          Hidden, not removed, while the keyboard is up. */}
      {createPortal(
        <nav
          aria-label={t("band.nav.label")}
          hidden={keyboardUp}
          className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <div className="mx-auto grid max-w-5xl grid-cols-5">
            {sections.map((section) =>
              item(
                section,
                "flex min-w-0 flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] text-muted-foreground leading-none outline-none focus-visible:bg-accent data-[status=active]:text-primary",
              ),
            )}
          </div>
        </nav>,
        document.body,
      )}
    </>
  );
}
