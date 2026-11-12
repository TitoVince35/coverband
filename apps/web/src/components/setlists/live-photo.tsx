import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { savedDocument } from "@/lib/offline-documents";

/**
 * A song's photo full screen, inside the app (live mode, #309): no new tab, so the list keeps its
 * place. The copy saved on the phone when there is one (offline, and faster), else the server's.
 */
export function LivePhoto({
  photo,
  onClose,
}: {
  photo: { id: string; title: string; url: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    let url: string | null = null;
    let done = false;
    void savedDocument(photo.id).then((blob) => {
      if (done) return;
      if (blob) url = URL.createObjectURL(blob);
      setSrc(url ?? photo.url);
    });
    return () => {
      done = true;
      setSrc(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none bg-black p-0 ring-0 sm:max-w-none"
      >
        <div className="flex items-center gap-2 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 text-white">
          <DialogTitle className="min-w-0 flex-1 truncate text-base">{photo?.title}</DialogTitle>
          <DialogDescription className="sr-only">{t("setlists.live.photo")}</DialogDescription>
          <Button
            variant="secondary"
            size="lg"
            className="h-12"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <XIcon />
            {t("common.close")}
          </Button>
        </div>
        <div className="flex min-h-0 items-center justify-center pb-[env(safe-area-inset-bottom)]">
          {src && (
            <img
              src={src}
              alt={photo?.title ?? ""}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
