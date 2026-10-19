import { AArrowDown, AArrowUp, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  LYRICS_SIZES,
  readLyricsSize,
  stepLyricsSize,
  storeLyricsSize,
  useWakeLock,
} from "@/lib/lyrics-view";

type Props = {
  title: string;
  lyrics: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * A song's lyrics full screen, for the stage (#131): the screen stays awake while it's open, and
 * the text size (−/+) is remembered on the device.
 */
export function LyricsView({ title, lyrics, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [size, setSize] = useState(readLyricsSize);
  useWakeLock(open);

  const step = (direction: 1 | -1) => {
    const next = stepLyricsSize(size, direction);
    setSize(next);
    storeLyricsSize(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
      >
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <DialogTitle className="min-w-0 flex-1 truncate font-heading text-base">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("songs.lyrics.view.description")}
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("songs.lyrics.view.smaller")}
            disabled={size === LYRICS_SIZES[0]}
            onClick={() => step(-1)}
          >
            <AArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("songs.lyrics.view.larger")}
            disabled={size === LYRICS_SIZES[LYRICS_SIZES.length - 1]}
            onClick={() => step(1)}
          >
            <AArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.close")}
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
          </Button>
        </div>
        <div
          className="overflow-y-auto whitespace-pre-wrap break-words px-5 py-6 leading-snug"
          style={{ fontSize: size }}
        >
          {lyrics}
        </div>
      </DialogContent>
    </Dialog>
  );
}
