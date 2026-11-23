import type { GigStatus } from "@coverband/shared";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<GigStatus, string> = {
  proposed: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  settled: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

/** A gig's status as a coloured badge: proposed, settled, cancelled. */
export function GigStatusBadge({ status }: { status: GigStatus }) {
  const { t } = useTranslation();
  return <Badge className={STATUS_STYLES[status]}>{t(`gigs.status.${status}`)}</Badge>;
}
