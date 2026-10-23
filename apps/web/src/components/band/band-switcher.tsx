import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { myBandsQuery } from "@/lib/bands";

const title = "truncate font-bold text-2xl tracking-tight";

/**
 * The band's name as the page title, opening the band's menu: its settings (#221, the band leader's;
 * shown disabled to musicians), and the other bands for members of several.
 */
export function BandSwitcher({
  current,
  isLeader,
}: {
  current: { name: string; slug: string };
  isLeader: boolean;
}) {
  const { t } = useTranslation();
  const bands = useQuery(myBandsQuery);
  const others = bands.data && bands.data.length > 1 ? bands.data : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex max-w-full items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("band.menu")}
      >
        <h1 className={title}>{current.name}</h1>
        <ChevronsUpDown className="size-5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {isLeader ? (
          <DropdownMenuItem asChild>
            <Link to="/b/$bandSlug/settings" params={{ bandSlug: current.slug }}>
              <Settings />
              {t("band.settings")}
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <Settings />
            {t("band.settings")}
          </DropdownMenuItem>
        )}
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("band.switch")}</DropdownMenuLabel>
            {others.map((band) => (
              <DropdownMenuItem key={band.slug} asChild>
                <Link to="/b/$bandSlug" params={{ bandSlug: band.slug }}>
                  <span className="flex-1 truncate">{band.name}</span>
                  {band.slug === current.slug && <Check />}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">{t("band.allBands")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
