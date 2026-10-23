import { DOCUMENT_LIMITS, type DocumentKind, type Instrument, opensInApp } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileMusic,
  FileText,
  Guitar,
  Image as ImageIcon,
  type LucideIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CollapsibleCard } from "@/components/collapsible-card";
import { InstrumentListEditor, withAdded } from "@/components/instruments/instrument-list-editor";
import { InstrumentTags } from "@/components/instruments/instrument-tags";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/use-language";
import { DOCUMENT_ACCEPT, isPhoto, shrinkPhoto, titleFrom } from "@/lib/document-files";
import { deleteDocument, updateDocument, uploadDocument } from "@/lib/documents";
import { ApiRequestError, errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useOnline } from "@/lib/online";

export type SongDocument = {
  id: string;
  title: string;
  kind: DocumentKind;
  instruments: Instrument[];
  addedById: string | null;
  addedBy: string | null;
  createdAt: string;
  url: string;
};

const ICONS: Record<DocumentKind, LucideIcon> = {
  photo: ImageIcon,
  pdf: FileText,
  guitarpro: Guitar,
  musescore: FileMusic,
};

type Props = {
  bandSlug: string;
  songId: string;
  documents: SongDocument[];
  /** The logged-in member: who added a document, or the band leader, deletes it. */
  userId: string;
  isLeader: boolean;
};

/**
 * A song's documents (#239): scores, chord grids' photos, Guitar Pro and MuseScore files, in a
 * closed accordion. Photos and PDFs open in a new tab, the others download. Any member adds them
 * and edits their title and instruments; who added one, or the band leader, deletes it.
 */
export function SongDocuments({ bandSlug, songId, documents, userId, isLeader }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  return (
    <CollapsibleCard title={t("songs.documents.title")} defaultOpen={false}>
      <div className="space-y-3">
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("songs.documents.empty")}</p>
        ) : (
          <ul className="divide-y" aria-label={t("songs.documents.title")}>
            {documents.map((document) => {
              const Icon = ICONS[document.kind];
              const inApp = opensInApp(document.kind);
              const date = formatDate(document.createdAt, language);
              return (
                <li key={document.id} className="flex items-start gap-2 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <a
                      href={document.url}
                      {...(inApp
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : { download: true })}
                      className="flex min-w-0 items-start gap-3 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-medium">{document.title}</span>
                        <span className="block truncate text-muted-foreground text-xs">
                          {t(`songs.documents.kinds.${document.kind}`)}
                          {" · "}
                          {document.addedBy
                            ? t("songs.documents.addedBy", { name: document.addedBy, date })
                            : t("songs.documents.addedOn", { date })}
                        </span>
                        <span className="sr-only">
                          {inApp ? t("songs.media.newTab") : t("songs.documents.downloads")}
                        </span>
                      </span>
                    </a>
                    <InstrumentTags instruments={document.instruments} className="pl-8" />
                  </div>
                  <DocumentDialog
                    bandSlug={bandSlug}
                    songId={songId}
                    document={document}
                    canDelete={isLeader || document.addedById === userId}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("songs.documents.edit", { title: document.title })}
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
        {documents.length < DOCUMENT_LIMITS.perSong && (
          <DocumentDialog
            bandSlug={bandSlug}
            songId={songId}
            trigger={
              <Button variant="outline" size="sm">
                <Plus />
                {t("songs.documents.add")}
              </Button>
            }
          />
        )}
      </div>
    </CollapsibleCard>
  );
}

/** Adds a document (a file, its title and instruments), or edits and deletes one. */
function DocumentDialog({
  bandSlug,
  songId,
  document,
  canDelete = false,
  trigger,
}: {
  bandSlug: string;
  songId: string;
  /** Absent: a new document. */
  document?: SongDocument;
  canDelete?: boolean;
  trigger: ReactNode;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [title, setTitle] = useState(document?.title ?? "");
  const [instruments, setInstruments] = useState<Instrument[]>(document?.instruments ?? []);
  const [typed, setTyped] = useState<Instrument | null>(null);
  const [progress, setProgress] = useState(0);

  const done = async (message: string) => {
    toast.success(message);
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
  };
  const fields = () => ({ title: title.trim(), instruments: withAdded(instruments, typed) });

  const save = useMutation({
    mutationFn: async () => {
      if (document) return updateDocument(bandSlug, songId, document.id, fields());
      if (!file) return;
      setProgress(0);
      await uploadDocument(bandSlug, songId, file, fields(), setProgress);
    },
    onSuccess: () => done(document ? t("songs.documents.saved") : t("songs.documents.added")),
  });
  const remove = useMutation({
    mutationFn: () => deleteDocument(bandSlug, songId, document?.id ?? ""),
    onSuccess: () => done(t("songs.documents.removed")),
  });

  // Every opening starts from the document as it is.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFile(null);
      setPickError(null);
      setTitle(document?.title ?? "");
      setInstruments(document?.instruments ?? []);
      setTyped(null);
      save.reset();
      remove.reset();
    }
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;
    save.reset();
    setPickError(null);
    setFile(null);
    try {
      let ready = picked;
      if (isPhoto(picked)) {
        // Shrunk as hard as reading allows: the online storage budget comes first.
        setPreparing(true);
        ready = await shrinkPhoto(picked);
      }
      if (ready.size > DOCUMENT_LIMITS.maxBytes) {
        setPickError(errorMessage(t, new ApiRequestError("document_too_large", "Too large")));
        return;
      }
      setFile(ready);
      if (!title.trim()) setTitle(titleFrom(picked.name));
    } catch {
      setPickError(errorMessage(t, new ApiRequestError("document_invalid", "Unreadable")));
    } finally {
      setPreparing(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document && !file) return;
    save.mutate();
  }

  const error = save.error ?? remove.error;
  const busy = save.isPending || remove.isPending || preparing;
  const uploading = save.isPending && !document;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild disabled={!online}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {document ? t("songs.documents.editTitle") : t("songs.documents.addTitle")}
            </DialogTitle>
            {!document && <DialogDescription>{t("songs.documents.formats")}</DialogDescription>}
          </DialogHeader>
          {!document && (
            <div className="space-y-2">
              <Label htmlFor="document-file">{t("songs.documents.file")}</Label>
              {/* On a phone, the picker offers the camera and the gallery too. */}
              <Input
                id="document-file"
                type="file"
                accept={DOCUMENT_ACCEPT}
                onChange={onPick}
                disabled={busy}
                aria-describedby="document-file-hint"
              />
              <p
                id="document-file-hint"
                role={pickError ? "alert" : undefined}
                className={pickError ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
              >
                {pickError ??
                  (preparing
                    ? t("songs.documents.preparing")
                    : file
                      ? t("songs.documents.ready", { size: fileSize(file.size, language) })
                      : t("songs.documents.maxSize"))}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="document-title">{t("songs.documents.documentTitle")}</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={DOCUMENT_LIMITS.title}
              autoComplete="off"
              required
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium text-sm">{t("songs.documents.instruments")}</legend>
            <p className="text-muted-foreground text-xs">{t("songs.media.instrumentsHint")}</p>
            <InstrumentListEditor
              id="document-instrument"
              list={instruments}
              onChange={setInstruments}
              typed={typed}
              onType={setTyped}
              nested
            />
          </fieldset>
          {uploading && (
            <div className="space-y-1">
              <progress
                className="h-2 w-full overflow-hidden rounded-full accent-primary"
                value={progress}
                max={1}
                aria-label={t("songs.documents.uploading")}
              />
              <p className="text-muted-foreground text-xs tabular-nums">
                {t("songs.documents.progress", { percent: Math.round(progress * 100) })}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, error)}
            </p>
          )}
          <DialogFooter className="gap-2">
            {document && canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    pending={remove.isPending}
                  >
                    <Trash2 />
                    {t("songs.documents.remove")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("songs.documents.removeTitle", { title: document.title })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("songs.documents.removeDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                      {t("songs.documents.remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="submit" disabled={busy || (!document && !file)} pending={save.isPending}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A file's size for people, in their language: "340 kB", "1.2 MB" ("340 ko", "1,2 Mo"). */
const fileSize = (bytes: number, language: string) => {
  const unit = bytes < 1_000_000 ? "kilobyte" : "megabyte";
  const value = unit === "kilobyte" ? Math.max(1, Math.round(bytes / 1000)) : bytes / 1_000_000;
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit,
    maximumFractionDigits: 1,
  }).format(value);
};
