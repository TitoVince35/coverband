import { MapPin } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAP_ZOOM, moved, tilesAround } from "@/lib/map-tiles";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

type Point = { latitude: number; longitude: number };

/** How far an arrow key moves the pin, in pixels. */
const KEY_STEP = 8;

/**
 * A venue on OpenStreetMap's tiles (#333), credited, its pin in the middle; `onMove` makes the
 * pin draggable (a pointer, or the arrow keys) to correct it. Nothing offline: the address and
 * Directions stay.
 */
export function VenueMap({
  point,
  label,
  onMove,
  height = 144,
  className,
}: {
  point: Point;
  /** What the map shows, for screen readers: the venue's name and address. */
  label: string;
  onMove?: ((point: Point) => void) | undefined;
  height?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // The pin's offset while it's dragged, in pixels.
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!online) return null;
  const tiles = width > 0 ? tilesAround(point, width, height, MAP_ZOOM) : [];
  const dx = drag?.x ?? 0;
  const dy = drag?.y ?? 0;
  const draggable = onMove !== undefined;

  return (
    <div
      ref={box}
      role="img"
      aria-label={t("gigs.map.label", { place: label })}
      className={cn("relative overflow-hidden bg-muted", className)}
      style={{ height }}
    >
      {tiles.map((tile) => (
        <img
          key={`${tile.x}/${tile.y}/${tile.left}`}
          src={tile.url}
          alt=""
          draggable={false}
          // OpenStreetMap asks for a Referer: the app's origin only (the app sends none otherwise).
          referrerPolicy="origin"
          className="pointer-events-none absolute size-64 max-w-none select-none"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
      {draggable ? (
        <button
          type="button"
          aria-label={t("gigs.map.pin")}
          className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-full cursor-grab touch-none items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{ marginLeft: dx, marginTop: dy }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: 0, y: 0, startX: event.clientX, startY: event.clientY });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            setDrag({ ...drag, x: event.clientX - drag.startX, y: event.clientY - drag.startY });
          }}
          onPointerUp={() => {
            if (drag && (drag.x || drag.y)) onMove(moved(point, drag.x, drag.y));
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(event) => {
            const step = {
              ArrowLeft: [-KEY_STEP, 0],
              ArrowRight: [KEY_STEP, 0],
              ArrowUp: [0, -KEY_STEP],
              ArrowDown: [0, KEY_STEP],
            }[event.key];
            if (!step) return;
            event.preventDefault();
            onMove(moved(point, step[0] ?? 0, step[1] ?? 0));
          }}
        >
          <Pin />
        </button>
      ) : (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <Pin />
        </span>
      )}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute right-0 bottom-0 rounded-tl bg-white/80 px-1 text-[10px] text-neutral-700"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

function Pin() {
  return (
    <MapPin
      aria-hidden
      className="size-8 fill-emerald-500 text-emerald-950 drop-shadow"
      strokeWidth={1.5}
    />
  );
}
