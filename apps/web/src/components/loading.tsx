import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * How long loading waits before showing anything (#190): data from the cache arrives sooner, and
 * a skeleton flashing for a moment is worse than nothing.
 */
export const LOADING_DELAY_MS = 150;

/** Shows its children only once LOADING_DELAY_MS has passed. */
export function Delayed({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return shown ? children : null;
}

/** A loading area: busy for screen readers, which hear "Loading…" (its name) instead of the shapes. */
function Loading({
  className,
  delayed = true,
  children,
}: {
  className?: string;
  /** False when something else already waited (the router's pending delay). */
  delayed?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const area = (
    <div role="status" aria-busy="true" aria-label={t("common.loading")}>
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </div>
  );
  return delayed ? <Delayed>{area}</Delayed> : area;
}

/**
 * A spinner for a whole page (the route guards waiting, before any page shows): the router
 * already waits LOADING_DELAY_MS before showing it.
 */
export function PageSpinner() {
  return (
    <Loading className="flex justify-center py-16" delayed={false}>
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </Loading>
  );
}

/** Rows of a list (bands, repertoire, lineup...): a title and a subtitle each. */
export function ListSkeleton({
  rows = 3,
  withIcon = false,
  className,
}: {
  rows?: number;
  /** A square before each row (the band list's logos, the lineup's avatars). */
  withIcon?: boolean;
  className?: string;
}) {
  return (
    <Loading className={cn("space-y-4", className)}>
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders never move
        <div key={row} className="flex items-center gap-3">
          {withIcon && <Skeleton className="size-12 shrink-0 rounded-md" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** A band's header and tabs, while the band loads. */
export function BandSkeleton() {
  return (
    <Loading className="space-y-6">
      <Skeleton className="h-8 w-1/2" />
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-24 w-full" />
    </Loading>
  );
}

/** A song's page: its title and artist, then its blocks. */
export function SongSkeleton() {
  return (
    <Loading className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
    </Loading>
  );
}
