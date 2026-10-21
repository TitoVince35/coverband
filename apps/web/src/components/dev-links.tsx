import { Database, Mail, Snail } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { drizzleStudioUrl, garageUrl, mailpitUrl } from "@/lib/dev-tools";
import { isSlowNetwork, setSlowNetwork } from "@/lib/slow-network";
import { cn } from "@/lib/utils";

/**
 * Development only: links to the local tools, each in a new tab, in amber so they never pass for
 * the app's own UI. Mailpit catches every email sent locally; Drizzle Studio (started by
 * `bun run dev`) browses the database; Garage's web UI browses the object storage. And a slow
 * network switch (#197), to see the loading skeletons.
 */
export function DevLinks() {
  const { t } = useTranslation();
  const { hostname } = window.location;
  const studio = drizzleStudioUrl(hostname);

  return (
    <nav
      aria-label={t("dev.tools")}
      className="flex items-center rounded-full bg-amber-400 text-amber-950"
    >
      <DevLink href={mailpitUrl(hostname)} label={t("dev.openMailpit")}>
        <Mail />
      </DevLink>
      {studio && (
        <DevLink href={studio} label={t("dev.openDatabase")}>
          <Database />
        </DevLink>
      )}
      <DevLink href={garageUrl(hostname)} label={t("dev.openStorage")}>
        <BucketIcon />
      </DevLink>
      <SlowNetworkSwitch />
    </nav>
  );
}

function DevLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-amber-950 hover:bg-amber-300 hover:text-amber-950 dark:hover:bg-amber-300"
          asChild
        >
          <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
            {children}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Every API request waits 2 seconds while it's on, remembered on the device. */
function SlowNetworkSwitch() {
  const { t } = useTranslation();
  const [on, setOn] = useState(isSlowNetwork);
  const label = on ? t("dev.slowNetworkOn") : t("dev.slowNetworkOff");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={on}
          aria-label={t("dev.slowNetwork")}
          onClick={() => {
            setSlowNetwork(!on);
            setOn(!on);
          }}
          className={cn(
            "text-amber-950 hover:bg-amber-300 hover:text-amber-950 dark:hover:bg-amber-300",
            on && "bg-amber-950 text-amber-400 hover:bg-amber-900 hover:text-amber-300",
          )}
        >
          <Snail />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A storage bucket in Lucide's style (Lucide only has a paint bucket). */
function BucketIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 7a5 5 0 0 1 10 0" />
      <path d="M4 7h16" />
      <path d="m5 7 1.6 12.2a2 2 0 0 0 2 1.8h6.8a2 2 0 0 0 2-1.8L19 7" />
    </svg>
  );
}
