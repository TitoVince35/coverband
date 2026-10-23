import type { DocumentKind } from "@coverband/shared";
import { Image as ImageIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { siGuitarpro } from "simple-icons";
import { BRAND_FILL } from "@/components/songs/provider-icon";
import { cn } from "@/lib/utils";

/**
 * MuseScore's symbol, from its 2024 logo (Wikimedia Commons, "MuseScore Logo 2024.svg": public
 * domain, a trademark), without the wordmark: it names the format, as the link logos do.
 */
const MUSESCORE = {
  viewBox: "-55 0 496 496",
  hex: "6A5EF5",
  path: "M198.706 0.650124C147.373 6.38346 103.906 43.9835 91.6394 93.3168C88.8394 104.383 86.3061 136.917 88.5727 131.983C89.2394 130.517 89.9061 127.45 89.9061 125.183C90.0394 123.05 91.2394 116.65 92.7061 111.183C101.906 75.7168 124.439 50.7835 157.373 39.4501C169.506 35.3168 172.039 34.9168 186.039 34.9168C212.039 34.7835 231.373 42.1168 247.506 57.8501C252.573 62.9168 256.706 67.8501 256.706 68.9168C256.706 69.9835 254.706 71.7168 252.439 72.9168C244.306 76.7835 235.639 85.7168 231.106 95.0501C226.973 103.45 226.706 104.783 226.706 118.65C226.706 132.25 226.973 133.85 230.706 141.183C240.973 161.45 260.573 172.117 285.239 171.05C299.373 170.517 310.573 165.317 320.573 154.65C334.173 140.25 339.906 121.583 336.839 101.05C330.039 52.5168 292.439 13.4501 242.973 3.31679C227.906 0.250124 210.973 -0.816542 198.706 0.650124Z M102.04 146.25C102.04 146.65 241.507 283.583 291.24 331.983C301.24 341.717 309.24 348.65 309.64 347.717C309.907 346.783 322.84 326.783 338.173 303.183C353.507 279.583 366.04 259.85 366.04 259.45C366.04 259.05 307.107 233.45 235.24 202.65C89.64 140.383 102.04 145.583 102.04 146.25Z M69.2395 227.984C41.2395 234.117 13.5061 260.25 4.43946 289.05C-6.49388 324.117 3.23946 373.05 28.4395 410.117C35.5061 420.517 49.7728 436.917 58.7061 444.917C74.4395 458.917 97.9061 473.05 120.173 481.85C145.906 492.117 164.839 495.45 197.373 495.45C244.706 495.45 281.106 483.05 315.773 455.317C348.173 429.184 371.239 389.984 380.706 344.917C383.239 332.917 386.173 288.25 384.306 289.984C383.906 290.384 382.973 296.384 382.173 303.317C379.906 321.984 377.373 330.384 369.373 346.65C350.973 383.85 313.906 411.317 272.173 418.65C238.573 424.65 191.106 415.984 164.973 399.05C154.439 392.25 139.373 378.65 139.373 375.85C139.373 375.05 142.706 371.85 146.706 368.784C165.506 354.65 175.773 333.184 175.773 307.984C175.906 284.784 168.573 267.317 152.039 250.517C139.906 238.384 130.573 233.05 113.506 228.65C101.239 225.584 81.7728 225.184 69.2395 227.984Z",
};

/** A generic PDF: a page with its folded corner and "PDF", in red. Never Adobe's icon. */
const PDF_RED = "#D93025";

/**
 * A document's kind, in colour (#239): Guitar Pro's logo (simple-icons, CC0, under its 3:1
 * contrast on light cards: the text colour there), MuseScore's symbol, our own PDF page, and a
 * photo icon. Decorative: the kind is written next to it.
 */
export function DocumentIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const size = cn("size-5 shrink-0", className);
  if (kind === "photo") {
    return <ImageIcon aria-hidden className={cn(size, "text-emerald-600 dark:text-emerald-500")} />;
  }
  if (kind === "pdf") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={size}>
        <path
          d="M5 1.5h9.5L20 7v14a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3.5 21V3A1.5 1.5 0 0 1 5 1.5Z"
          fill={PDF_RED}
        />
        <path d="M14.5 1.5V6a1 1 0 0 0 1 1H20" fill="#fff" fillOpacity={0.45} />
        <text
          x="11.75"
          y="17.5"
          textAnchor="middle"
          fontSize="6.4"
          fontWeight="700"
          fontFamily="Noto Sans, Helvetica, Arial, sans-serif"
          fill="#fff"
        >
          PDF
        </text>
      </svg>
    );
  }
  const { viewBox, hex, path, fill } =
    kind === "guitarpro"
      ? {
          viewBox: "0 0 24 24",
          hex: siGuitarpro.hex,
          path: siGuitarpro.path,
          fill: BRAND_FILL.light,
        }
      : { ...MUSESCORE, fill: BRAND_FILL.none };
  return (
    <svg
      viewBox={viewBox}
      aria-hidden
      className={cn(size, fill)}
      style={{ "--brand": `#${hex}` } as CSSProperties}
    >
      <path d={path} />
    </svg>
  );
}
