import type { Instrument, InstrumentCode } from "@coverband/shared";
import { Drum, Guitar, KeyboardMusic, type LucideIcon, MicVocal, Music, Piano } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Instruments Lucide draws. */
const LUCIDE: Partial<Record<InstrumentCode, LucideIcon>> = {
  guitar: Guitar,
  drums: Drum,
  vocals: MicVocal,
  keyboards: KeyboardMusic,
  piano: Piano,
};

/** The others, drawn in Lucide's style: 24 × 24, 2 px round strokes, `currentColor`. */
const DRAWN: Partial<Record<InstrumentCode, ReactNode>> = {
  bass_guitar: (
    <>
      <path d="M14.6 9.4 9.5 14.5" />
      <path d="M16 6.5l4.5-4.5 1.5 1.5-4.5 4.5z" />
      <path d="M18.5 4.5l-1-1M20 6l-1-1" />
      <path d="M8.6 11.6a2.6 2.6 0 0 1 3.4-.6 1 1 0 0 1 .3 1.3 2.5 2.5 0 0 0 1 3.1 1 1 0 0 1 .3 1.3 2.6 2.6 0 0 1-1.6 1.6l-.8.3a1.8 1.8 0 0 0-1.1 1.6 2.9 2.9 0 0 1-2.9 2.9A4.6 4.6 0 0 1 2.6 19a2.9 2.9 0 0 1 2.9-2.9 1.8 1.8 0 0 0 1.6-1.1z" />
      <path d="M5 18.5l1.5 1.5" />
    </>
  ),
  ukulele: (
    <>
      <path d="M13 11l5-5" />
      <path d="M17 4l3 3 2-2-3-3z" />
      <path d="M8 11a3 3 0 0 1 4.2 1.8 3 3 0 0 1-1 3.7l-.5.4a2 2 0 0 0-.7 1.6A3.5 3.5 0 0 1 6.5 22 4.5 4.5 0 0 1 2 17.5a3.5 3.5 0 0 1 3.5-3.5 2 2 0 0 0 1.6-.7l.4-.5z" />
      <path d="M6 17.5h.01" />
    </>
  ),
  banjo: (
    <>
      <circle cx="8" cy="16" r="6" />
      <circle cx="8" cy="16" r="2.5" />
      <path d="M12.5 11.5 20 4" />
      <path d="M19 2.5l2.5 2.5" />
      <path d="M12.5 11.5" />
    </>
  ),
  violin: (
    <>
      <g transform="rotate(40 12 12)">
        <path d="M12 2v2" />
        <path d="M10.8 3h2.4" />
        <path d="M12 4v5" />
        <path d="M9.4 9.4a2.2 2.2 0 0 1 1.8-.4h1.6a2.2 2.2 0 0 1 1.8.4c.8.8.2 2.1-.4 2.6 1.3.9 1.7 2.2 1.3 3.9-.4 1.7-1.7 2.6-3.5 2.6s-3.1-.9-3.5-2.6c-.4-1.7 0-3 1.3-3.9-.6-.5-1.2-1.8-.4-2.6z" />
      </g>
      <path d="M3 14 14 3" />
    </>
  ),
  cello: (
    <>
      <path d="M12 1.5V7" />
      <path d="M10.5 2.8h3" />
      <path d="M8.8 8.6A2.6 2.6 0 0 1 10.8 7.5h2.4a2.6 2.6 0 0 1 2 1.1c.7 1 .2 2.5-.6 3 1.6.9 2.3 2.5 1.8 4.4-.5 2-2.2 3-4.4 3s-3.9-1-4.4-3c-.5-1.9.2-3.5 1.8-4.4-.8-.5-1.3-2-.6-3z" />
      <path d="M12 19v3.5" />
      <path d="M10.3 13v3M13.7 13v3" />
    </>
  ),
  upright_bass: (
    <>
      <path d="M12 1v9" />
      <path d="M10.5 2.5h3" />
      <path d="M10.5 10h3c.8 0 1.4.6 1.5 1.4l.2 1.1c1.6 1 2.3 2.6 1.8 4.6-.5 2.1-2.4 3.4-5 3.4s-4.5-1.3-5-3.4c-.5-2 .2-3.6 1.8-4.6l.2-1.1c.1-.8.7-1.4 1.5-1.4z" />
      <path d="M12 21.5V23" />
      <path d="M10.3 15v3M13.7 15v3" />
    </>
  ),
  accordion: (
    <>
      <path d="M3 5h3v14H3z" />
      <path d="M18 5h3v14h-3z" />
      <path d="M6 5l2.4 2.8L6 10.6l2.4 2.8L6 16.2 8.4 19" />
      <path d="M18 5l-2.4 2.8 2.4 2.8-2.4 2.8 2.4 2.8-2.4 2.8" />
      <path d="M8.4 7.8h7.2M8.4 13.4h7.2" />
    </>
  ),
  trumpet: (
    <>
      <path d="M2 10v4" />
      <path d="M2 12h12" />
      <path d="M14 12l7-4.5v9z" />
      <path d="M5 12v2.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="M7 8.5V12M9.5 8.5V12M12 8.5V12" />
    </>
  ),
  trombone: (
    <>
      <path d="M2 8h12" />
      <path d="M2 13h12" />
      <path d="M14 8l7-4.5v9z" />
      <path d="M4 13a2.5 2.5 0 0 1 0-5" />
      <path d="M5 16.5h9a1.75 1.75 0 0 0 0-3.5" />
      <path d="M8 8v8.5" />
    </>
  ),
  french_horn: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
      <path d="M14.9 14.9 17 17" />
      <path d="M17 17l-1.8 4.8M17 17l4.8-1.8" />
      <path d="M15.2 21.8l6.6-6.6" />
      <path d="M3 10H1.5" />
    </>
  ),
  tuba: (
    <>
      <path d="M7 2h10" />
      <path d="M8 2l1.5 6h5L16 2" />
      <path d="M9.5 8v9a2.5 2.5 0 0 0 5 0V8" />
      <path d="M14.5 12H17v4" />
      <path d="M9.5 18H7a2 2 0 0 0 0 4h5" />
    </>
  ),
  sousaphone: (
    <>
      <circle cx="16" cy="7" r="5" />
      <circle cx="16" cy="7" r="2" />
      <path d="M12.2 10.2a6 6 0 1 0 .8 5.8" />
      <path d="M3 16h2" />
    </>
  ),
  saxophone: (
    <>
      <path d="M7 2l3 1.5" />
      <path d="M10 3.5V15a4 4 0 0 0 8 0v-1.5" />
      <path d="M15.5 13.5h5" />
      <path d="M13 7h.01M13 10h.01M13 13h.01" />
    </>
  ),
  flute: (
    <>
      <path d="M4.5 21.5 2.5 19.5 19.5 2.5 21.5 4.5z" />
      <path d="M8 15h.01M11 12h.01M14 9h.01" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  clarinet: (
    <>
      <path d="M11 2h2v3h-2z" />
      <path d="M10.5 5h3l.5 13h-4z" />
      <path d="M10 18l-2 4h8l-2-4" />
      <path d="M12 8.5h.01M12 11.5h.01M12 14.5h.01" />
    </>
  ),
  harmonica: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <path d="M2 12h20" />
      <path d="M6 8v4M10 8v4M14 8v4M18 8v4" />
    </>
  ),
  percussion: (
    <>
      <path d="M3 7h8l-1 13H4z" />
      <path d="M3 7a4 1.5 0 0 0 8 0" />
      <path d="M13 9h8l-1 11h-6z" />
      <path d="M13 9a4 1.5 0 0 0 8 0" />
      <path d="M11 13h2" />
    </>
  ),
};

/** Instruments with their own icon (every known one: checked by a test). */
export const ICON_CODES = [...Object.keys(LUCIDE), ...Object.keys(DRAWN)] as InstrumentCode[];

/**
 * An instrument's icon: its own for a known instrument, a music note for free text. Decorative:
 * the label is always shown next to it. Sized like Lucide icons (`size-4` by default).
 */
export function InstrumentIcon({
  instrument,
  className,
}: {
  instrument: Instrument;
  className?: string;
}) {
  const code = "code" in instrument ? instrument.code : null;
  const classes = cn("size-4 shrink-0", className);
  const Lucide = code ? LUCIDE[code] : undefined;
  const drawn = code ? DRAWN[code] : undefined;
  if (drawn) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={classes}
        aria-hidden="true"
      >
        {drawn}
      </svg>
    );
  }
  const Icon = Lucide ?? Music;
  return <Icon className={classes} aria-hidden="true" />;
}
