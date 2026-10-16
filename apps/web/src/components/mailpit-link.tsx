import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mailpitUrl } from "@/lib/mailpit";

/** Development only: opens Mailpit, which catches every email sent locally. */
export function MailpitLink() {
  const { t } = useTranslation();
  const label = t("dev.openMailpit");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" asChild>
          <a
            href={mailpitUrl(window.location.hostname)}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
          >
            <Mail />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
