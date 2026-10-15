import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown } from "lucide-react";
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

/** The band's name as the page title; a menu to switch band for members of several bands. */
export function BandSwitcher({ current }: { current: { name: string; slug: string } }) {
  const { t } = useTranslation();
  const bands = useQuery(myBandsQuery);

  if (!bands.data || bands.data.length < 2) {
    return <h1 className={title}>{current.name}</h1>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex max-w-full items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("band.switch")}
      >
        <h1 className={title}>{current.name}</h1>
        <ChevronsUpDown className="size-5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t("band.switch")}</DropdownMenuLabel>
        {bands.data.map((band) => (
          <DropdownMenuItem key={band.slug} asChild>
            <Link to="/b/$bandSlug" params={{ bandSlug: band.slug }}>
              <span className="flex-1 truncate">{band.name}</span>
              {band.slug === current.slug && <Check />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">{t("band.allBands")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
