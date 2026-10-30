import { formatBytes } from "@/lib/format";

const SIZE = 80;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The share of `total` used, from 0 to 1 (0 without a total). */
export function usedShare(used: number, total: number) {
  return total > 0 ? Math.min(used / total, 1) : 0;
}

/** The percentage shown: one decimal under 10 %, so a little use doesn't read as none. */
export function formatShare(share: number) {
  const percent = share * 100;
  const digits = percent > 0 && percent < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(percent)}%`;
}

/** Storage used out of its maximum: a ring (the used part in the primary colour), then in words. */
export function StorageRing({ used, total }: { used: number; total: number }) {
  const share = usedShare(used, total);
  const words = `${formatBytes(used)} of ${formatBytes(total)}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative size-16 shrink-0">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90 size-full"
          role="img"
          aria-label={`${formatShare(share)} used: ${words}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          {share > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(share * CIRCUMFERENCE, 0.01)} ${CIRCUMFERENCE}`}
              className="stroke-primary"
            />
          )}
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center font-heading font-semibold text-xs tabular-nums"
        >
          {formatShare(share)}
        </span>
      </div>
      <p className="whitespace-nowrap tabular-nums">
        <span className="block font-heading font-semibold text-lg">{formatBytes(used)}</span>
        <span className="text-muted-foreground text-sm">of {formatBytes(total)}</span>
      </p>
    </div>
  );
}
