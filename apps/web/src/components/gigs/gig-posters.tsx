import { GIG_POSTER_LIMITS, posterUrl } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Share2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PhotoView } from "@/components/songs/photo-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POSTER_MAX_BYTES, POSTER_SIZE, shrinkPhoto, titleFrom } from "@/lib/document-files";
import { errorMessage } from "@/lib/errors";
import { type Gig, removePoster, uploadPoster } from "@/lib/gigs";
import { useOnline } from "@/lib/online";
import { posterFileName, shareFile } from "@/lib/share";

type Poster = Gig["posters"][number];

/** How a poster opens full screen: PhotoView's shape. */
const viewed = (bandSlug: string, gigId: string, poster: Poster) => ({
  id: poster.id,
  title: poster.title,
  url: posterUrl(bandSlug, gigId, poster.id),
});

/**
 * The gig form's posters (#330): thumbnails, "n of 5", add (an image, shrunk in the browser, a
 * title) and remove. Uploaded at once, apart from Save; only once the gig exists.
 */
export function PostersField({ bandSlug, gig }: { bandSlug: string; gig: Gig | undefined }) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removing, setRemoving] = useState<Poster | null>(null);
  const [open, setOpen] = useState<Poster | null>(null);

  const remove = useMutation({
    networkMode: "always",
    mutationFn: (poster: Poster) => removePoster(bandSlug, gig?.id ?? "", poster.id),
    onSuccess: async () => {
      toast.success(t("gigs.posters.removed"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug, "gigs"] });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  if (!gig) {
    return (
      <section className="space-y-1">
        <h3 className="font-heading font-semibold text-base">{t("gigs.posters.title")}</h3>
        <p className="text-muted-foreground text-sm">{t("gigs.posters.afterSave")}</p>
      </section>
    );
  }
  const full = gig.posters.length >= GIG_POSTER_LIMITS.perGig;
  return (
    <section className="space-y-2" aria-label={t("gigs.posters.title")}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="flex-1 font-heading font-semibold text-base">{t("gigs.posters.title")}</h3>
        <span className="text-muted-foreground text-xs">
          {t("gigs.posters.count", {
            count: gig.posters.length,
            max: GIG_POSTER_LIMITS.perGig,
            mb: GIG_POSTER_LIMITS.maxBytes / 1024 / 1024,
          })}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {gig.posters.map((poster) => (
          <li key={poster.id} className="relative min-w-0">
            <button
              type="button"
              className="block aspect-[3/4] w-full overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("gigs.posters.open", { title: poster.title })}
              onClick={() => setOpen(poster)}
            >
              <img
                src={posterUrl(bandSlug, gig.id, poster.id)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
            <p className="mt-1 truncate text-xs">{poster.title}</p>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1 right-1 rounded-full shadow"
              disabled={!online}
              aria-label={t("gigs.posters.remove", { title: poster.title })}
              onClick={() => setRemoving(poster)}
            >
              <X />
            </Button>
          </li>
        ))}
        {!full && (
          <li>
            <button
              type="button"
              disabled={!online}
              onClick={() => input.current?.click()}
              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <ImagePlus aria-hidden className="size-6" />
              {t("gigs.posters.add")}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t("gigs.posters.add")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) setPicked(file);
        }}
      />
      {picked && (
        <AddPosterDialog
          bandSlug={bandSlug}
          gigId={gig.id}
          file={picked}
          onClose={() => setPicked(null)}
        />
      )}
      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {t("gigs.posters.removeTitle", { title: removing?.title ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("gigs.posters.removeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => removing && remove.mutate(removing)}
            >
              {t("gigs.posters.removeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PhotoView
        photo={open ? viewed(bandSlug, gig.id, open) : null}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}

/** A picked image: its preview and title, then shrunk and sent with its progress. */
function AddPosterDialog({
  bandSlug,
  gigId,
  file,
  onClose,
}: {
  bandSlug: string;
  gigId: string;
  file: File;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(() => titleFrom(file.name));
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const add = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      setProgress(0);
      const shrunk = await shrinkPhoto(file, { size: POSTER_SIZE, maxBytes: POSTER_MAX_BYTES });
      await uploadPoster(bandSlug, gigId, shrunk, title.trim(), setProgress);
    },
    onSuccess: async () => {
      toast.success(t("gigs.posters.added"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug, "gigs"] });
      onClose();
    },
    onError: () => setProgress(null),
  });

  return (
    // Never closed by a tap outside (the photo picker's, on a phone), nor while it's sent.
    <Dialog open onOpenChange={(next) => !next && !add.isPending && onClose()}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) add.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("gigs.posters.addTitle")}</DialogTitle>
            <DialogDescription>{t("gigs.posters.addHint")}</DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview}
              alt=""
              className="mx-auto max-h-56 max-w-full rounded-lg border object-contain"
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-title`}>{t("gigs.posters.posterTitle")}</Label>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={GIG_POSTER_LIMITS.title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {progress !== null && (
            <progress
              className="h-2 w-full accent-primary"
              value={progress}
              max={1}
              aria-label={t("gigs.posters.sending")}
            />
          )}
          {add.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, add.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={add.isPending} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || !online} pending={add.isPending}>
              {t("gigs.posters.addButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The compact view's posters (#330): each opens full screen in the app, with Download and Share
 * (the phone's share sheet, a download where it can't share files). Online only.
 */
export function PostersList({ bandSlug, gig }: { bandSlug: string; gig: Gig }) {
  const { t } = useTranslation();
  const online = useOnline();
  const [open, setOpen] = useState<Poster | null>(null);
  const share = useMutation({
    networkMode: "always",
    mutationFn: async (poster: Poster) => {
      const url = posterUrl(bandSlug, gig.id, poster.id);
      return shareFile(url, posterFileName(poster.title, poster.extension), poster.title);
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });
  if (gig.posters.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-heading font-semibold">{t("gigs.posters.title")}</h3>
      {!online && <p className="text-muted-foreground text-sm">{t("gigs.posters.offline")}</p>}
      <ul>
        {gig.posters.map((poster) => {
          const url = posterUrl(bandSlug, gig.id, poster.id);
          return (
            <li key={poster.id} className="flex min-h-14 items-center gap-3">
              <button
                type="button"
                disabled={!online}
                className="h-12 w-10 shrink-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("gigs.posters.open", { title: poster.title })}
                onClick={() => setOpen(poster)}
              >
                {online && (
                  <img src={url} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm">{poster.title}</span>
              {online ? (
                <Button asChild variant="secondary" size="icon-lg" className="rounded-full">
                  <a
                    href={url}
                    download={posterFileName(poster.title, poster.extension)}
                    aria-label={t("gigs.posters.download", { title: poster.title })}
                  >
                    <Download />
                  </a>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="icon-lg"
                  className="rounded-full"
                  disabled
                  aria-label={t("gigs.posters.download", { title: poster.title })}
                >
                  <Download />
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon-lg"
                className="rounded-full"
                disabled={!online}
                pending={share.isPending && share.variables?.id === poster.id}
                aria-label={t("gigs.posters.share", { title: poster.title })}
                onClick={() => share.mutate(poster)}
              >
                <Share2 />
              </Button>
            </li>
          );
        })}
      </ul>
      <PhotoView
        photo={open ? viewed(bandSlug, gig.id, open) : null}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
