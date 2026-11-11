import { formatDuration, playedDuration, SETLIST_LIMITS, setlistDuration } from "@coverband/shared";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  EllipsisVertical,
  GripVertical,
  ListPlus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddSongsDialog, AddSongsPanel } from "@/components/setlists/add-songs";
import { formatSetlistDuration, songsDuration } from "@/components/setlists/setlist-duration";
import { EnergyPeppers, SongStatusBadge } from "@/components/songs/song-status";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import {
  addPart,
  addSongs,
  type Draft,
  type DraftEntry,
  type DraftSong,
  findEntry,
  movePart,
  moveStep,
  moveTo,
  otherPlaces,
  removePart,
  removeSong,
  renamePart,
  songCount,
  toContent,
  toDraft,
} from "@/lib/setlist-editor";
import { type Setlist, saveSetlistContent, setlistQuery } from "@/lib/setlists";
import { cn } from "@/lib/utils";

type SaveStatus = "saved" | "saving" | "conflict" | "error";

/**
 * The editor's draft, saved whole at each change (#272): one save at a time, the latest draft
 * sent once the previous save is done, each with the version it was read at. A save refused
 * because someone else saved meanwhile stops the saving: the member reloads.
 */
function useAutosave(bandSlug: string, setlist: Setlist) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toDraft(setlist.parts));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const version = useRef(setlist.version);
  const unsent = useRef<Draft | null>(null);
  const sending = useRef(false);
  const stopped = useRef(false);

  const send = useCallback(async () => {
    if (sending.current || stopped.current || !unsent.current) return;
    const next = unsent.current;
    unsent.current = null;
    sending.current = true;
    setStatus("saving");
    try {
      const saved = await saveSetlistContent(bandSlug, setlist.id, {
        version: version.current,
        parts: toContent(next),
      });
      if (saved) {
        version.current = saved.version;
        queryClient.setQueryData(setlistQuery(bandSlug, setlist.id).queryKey, saved);
      }
      void queryClient.invalidateQueries({
        queryKey: ["bands", bandSlug, "setlists"],
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["bands", bandSlug, "activity"] });
      sending.current = false;
      if (unsent.current) void send();
      else setStatus("saved");
    } catch (error) {
      sending.current = false;
      if (error instanceof ApiRequestError && error.code === "setlist_outdated") {
        stopped.current = true;
        setStatus("conflict");
      } else {
        // Kept: the next change sends it again.
        unsent.current ??= next;
        setStatus("error");
        toast.error(errorMessage(t, error));
      }
    }
  }, [bandSlug, setlist.id, queryClient, t]);

  // A newer version from the server (the saved copy shown first, then fetched again; another
  // member's save) replaces the draft, unless this member has a change of their own on the way.
  useEffect(() => {
    if (setlist.version <= version.current || sending.current || unsent.current) return;
    version.current = setlist.version;
    setDraft(toDraft(setlist.parts));
  }, [setlist.version, setlist.parts]);

  /** Shows a change at once and saves it. */
  const change = (next: Draft) => {
    setDraft(next);
    unsent.current = next;
    void send();
  };

  /** The setlist as saved now, after a refused save. */
  const reload = async () => {
    const fresh = await queryClient.fetchQuery({
      ...setlistQuery(bandSlug, setlist.id),
      staleTime: 0,
    });
    version.current = fresh.version;
    unsent.current = null;
    stopped.current = false;
    setDraft(toDraft(fresh.parts));
    setStatus("saved");
  };

  return { draft, setDraft, change, status, reload };
}

/** A part's name, or "Part 2" without one. */
const usePartLabel = () => {
  const { t } = useTranslation();
  return (draft: Draft, index: number) =>
    draft[index]?.name ?? t("setlists.part.default", { n: index + 1 });
};

/**
 * A setlist's parts and songs, edited as designed (#272): each change shows at once and is saved;
 * songs are dragged by their handle (within or across parts), or selected to move them with
 * buttons; parts are added, renamed, moved and removed; songs are added from the repertoire.
 * Read-only when archived or offline.
 */
export function SetlistEditor({ bandSlug, setlist }: { bandSlug: string; setlist: Setlist }) {
  const { t } = useTranslation();
  const online = useOnline();
  const readOnly = setlist.archivedAt !== null || !online;
  const { draft, setDraft, change, status, reload } = useAutosave(bandSlug, setlist);
  const partLabel = usePartLabel();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reloading, setReloading] = useState(false);
  // The draft when a drag started: a cancelled drag puts it back.
  const beforeDrag = useRef<Draft | null>(null);
  const others = otherPlaces(draft);
  const total = setlistDuration(draft.flatMap((part) => part.songs.map((entry) => entry.song)));
  const count = songCount(draft);
  const selectedAt = selected ? findEntry(draft, selected) : null;
  // Songs are added to the selected song's part, else the last one.
  const addTarget = selectedAt?.part ?? draft.length - 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** The part and index a drag is over: a song's place, or a part's (empty) list. */
  const dropPlace = (overId: string) => {
    const part = draft.findIndex((p) => `part:${p.key}` === overId);
    if (part >= 0) return { part, index: draft[part]?.songs.length ?? 0 };
    return findEntry(draft, overId);
  };

  // Across parts, the song follows the pointer at once; the change is saved when it's dropped.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findEntry(draft, String(active.id));
    const to = dropPlace(String(over.id));
    if (!from || !to || from.part === to.part) return;
    setDraft(moveTo(draft, String(active.id), to.part, to.index));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const from = findEntry(draft, String(active.id));
    const to = over ? dropPlace(String(over.id)) : null;
    if (!from || !to) return change(draft);
    change(
      from.part === to.part && from.index !== to.index
        ? moveTo(draft, String(active.id), to.part, to.index)
        : draft,
    );
  };

  const addPanel = (onDone?: () => void) => (
    <AddSongsPanel
      bandSlug={bandSlug}
      draft={draft}
      defaultPart={addTarget}
      disabled={readOnly}
      variant={onDone ? "dialog" : "aside"}
      onCancel={onDone}
      onAdd={(part, songs: DraftSong[]) => {
        change(addSongs(draft, part, songs));
        toast.success(
          t("setlists.add.added", { count: songs.length, part: partLabel(draft, part) }),
        );
        onDone?.();
      }}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-muted px-4 py-3">
          <p className="font-semibold tabular-nums">
            {formatSetlistDuration(t, total)}{" "}
            <span className="font-normal text-muted-foreground">
              · {t("setlists.songCount", { count })} ·{" "}
              {t("setlists.partCount", { count: draft.length })}
            </span>
          </p>
          {total.missing > 0 && (
            <p className="text-amber-700 text-xs dark:text-amber-300">
              {t("setlists.duration.missing", { count: total.missing })}
            </p>
          )}
          {!readOnly && <SaveState status={status} />}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            beforeDrag.current = draft;
          }}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            if (beforeDrag.current) setDraft(beforeDrag.current);
          }}
        >
          {draft.map((part, partIndex) => (
            <PartSection
              key={part.key}
              draft={draft}
              index={partIndex}
              label={partLabel(draft, partIndex)}
              readOnly={readOnly}
              onChange={change}
            >
              <SortableContext
                items={part.songs.map((entry) => entry.key)}
                strategy={verticalListSortingStrategy}
              >
                {part.songs.map((entry, index) => (
                  <SongRow
                    key={entry.key}
                    entry={entry}
                    number={index + 1}
                    readOnly={readOnly}
                    selected={selected === entry.key}
                    onSelect={() => setSelected(selected === entry.key ? null : entry.key)}
                    alsoIn={others.get(entry.key)?.map((p) => partLabel(draft, p))}
                  >
                    {selected === entry.key && !readOnly && (
                      <SongTools
                        draft={draft}
                        entry={entry}
                        partLabel={(p) => partLabel(draft, p)}
                        onChange={(next, keepSelected = true) => {
                          change(next);
                          if (!keepSelected) setSelected(null);
                        }}
                      />
                    )}
                  </SongRow>
                ))}
              </SortableContext>
            </PartSection>
          ))}
        </DndContext>

        {!readOnly && (
          <>
            <p className="text-muted-foreground text-xs">{t("setlists.editor.hint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1 lg:hidden" onClick={() => setAdding(true)}>
                <Plus />
                {t("setlists.add.title")}
              </Button>
              <Button
                variant="outline"
                disabled={draft.length >= SETLIST_LIMITS.parts}
                title={
                  draft.length >= SETLIST_LIMITS.parts
                    ? t("setlists.part.max", { max: SETLIST_LIMITS.parts })
                    : undefined
                }
                onClick={() => change(addPart(draft))}
              >
                <ListPlus />
                {t("setlists.part.add")}
              </Button>
            </div>
            <AddSongsDialog open={adding} onOpenChange={setAdding}>
              {addPanel(() => setAdding(false))}
            </AddSongsDialog>
          </>
        )}
      </div>
      {!readOnly && (
        <aside
          className="hidden rounded-xl border p-4 lg:block"
          aria-label={t("setlists.add.title")}
        >
          <h3 className="mb-3 font-heading font-semibold">{t("setlists.add.title")}</h3>
          {addPanel()}
        </aside>
      )}

      <AlertDialog open={status === "conflict"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setlists.conflict.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("setlists.conflict.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              pending={reloading}
              onClick={async () => {
                setReloading(true);
                try {
                  await reload();
                } catch (error) {
                  toast.error(errorMessage(t, error));
                } finally {
                  setReloading(false);
                }
              }}
            >
              <RefreshCw />
              {t("setlists.conflict.reload")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Saved", "Saving…", or "Not saved". */
function SaveState({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  return (
    <p role="status" className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
      {status === "saved" && <Check className="size-3.5 text-primary" />}
      {status === "error" && <TriangleAlert className="size-3.5 text-destructive" />}
      {status === "saving"
        ? t("setlists.editor.saving")
        : status === "error" || status === "conflict"
          ? t("setlists.editor.notSaved")
          : t("setlists.editor.saved")}
    </p>
  );
}

/** A part: its name, duration and actions, then its songs (a drop target, even empty). */
function PartSection({
  draft,
  index,
  label,
  readOnly,
  onChange,
  children,
}: {
  draft: Draft;
  index: number;
  label: string;
  readOnly: boolean;
  onChange: (next: Draft) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const part = draft[index];
  const { setNodeRef } = useDroppable({ id: `part:${part?.key}` });
  if (!part) return null;
  const songs = part.songs.map((entry) => entry.song);
  return (
    <section aria-label={label} className="rounded-xl border">
      <div className="flex items-center gap-2 border-b bg-muted/50 py-1 pr-1 pl-4">
        <h3 className="min-w-0 flex-1 truncate font-heading font-semibold">{label}</h3>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {songsDuration(t, songs)} · {t("setlists.songCount", { count: songs.length })}
        </span>
        {!readOnly ? (
          <PartMenu draft={draft} index={index} label={label} onChange={onChange} />
        ) : (
          <span className="h-9" />
        )}
      </div>
      <ol ref={setNodeRef} className="min-h-12 divide-y">
        {part.songs.length === 0 && (
          <li className="px-4 py-3 text-muted-foreground text-sm">{t("setlists.part.empty")}</li>
        )}
        {children}
      </ol>
    </section>
  );
}

/** A part's actions: rename, move, remove (its songs too, confirmed); never the last part. */
function PartMenu({
  draft,
  index,
  label,
  onChange,
}: {
  draft: Draft;
  index: number;
  label: string;
  onChange: (next: Draft) => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState("");
  const songs = draft[index]?.songs.length ?? 0;
  const remove = () => onChange(removePart(draft, index));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("setlists.part.actions", { part: label })}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onSelect={() => {
              setName(draft[index]?.name ?? "");
              setRenaming(true);
            }}
          >
            <Pencil />
            {t("setlists.part.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === 0}
            onSelect={() => onChange(movePart(draft, index, -1))}
          >
            <ArrowUp />
            {t("setlists.part.moveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === draft.length - 1}
            onSelect={() => onChange(movePart(draft, index, 1))}
          >
            <ArrowDown />
            {t("setlists.part.moveDown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={draft.length <= 1}
            onSelect={() => (songs > 0 ? setRemoving(true) : remove())}
          >
            <Trash2 />
            {t("setlists.part.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onChange(renamePart(draft, index, name));
              setRenaming(false);
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-heading">{t("setlists.part.rename")}</DialogTitle>
              <DialogDescription>{t("setlists.part.nameHint", { n: index + 1 })}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="part-name">{t("setlists.part.name")}</Label>
              <Input
                id="part-name"
                value={name}
                maxLength={50}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("setlists.part.rename")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setlists.part.removeTitle", { part: label })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("setlists.part.removeDescription", { count: songs })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {t("setlists.part.removeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A song of a part: its handle, number, title, artist, warnings, duration and energy. */
function SongRow({
  entry,
  number,
  readOnly,
  selected,
  onSelect,
  alsoIn,
  children,
}: {
  entry: DraftEntry;
  number: number;
  readOnly: boolean;
  selected: boolean;
  onSelect: () => void;
  alsoIn: string[] | undefined;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.key, disabled: readOnly });
  const { song } = entry;
  const duration = playedDuration(song);
  const content = (
    <>
      <span className="w-5 shrink-0 text-right text-muted-foreground text-sm tabular-nums">
        {number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{song.title}</span>
        <span className="block truncate text-muted-foreground text-sm">{song.artist}</span>
        {(alsoIn || song.archivedAt || song.status !== "ready") && (
          <span className="mt-1 flex flex-wrap gap-1">
            {alsoIn && (
              <span className="rounded-4xl bg-amber-500/15 px-2 text-amber-700 text-xs dark:text-amber-300">
                {t("setlists.editor.alsoIn", { parts: alsoIn.join(", ") })}
              </span>
            )}
            {song.archivedAt && (
              <span className="rounded-4xl bg-muted px-2 text-muted-foreground text-xs">
                {t("setlists.editor.archivedSong")}
              </span>
            )}
            {song.status !== "ready" && <SongStatusBadge status={song.status} />}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
        <span
          className={cn(
            "font-semibold",
            duration === null && "font-normal text-amber-700 text-xs dark:text-amber-300",
          )}
        >
          {duration === null ? t("setlists.editor.noDuration") : formatDuration(duration)}
        </span>
        <EnergyPeppers energy={song.energy} className="text-xs" />
      </span>
    </>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative bg-card",
        isDragging && "z-10 opacity-80 shadow-lg",
        selected && "bg-primary/10",
      )}
    >
      <div className="flex items-center">
        {readOnly ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-4 pl-4">{content}</div>
        ) : (
          <>
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="flex h-14 w-10 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("setlists.editor.drag", { title: song.title })}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={selected}
              onClick={onSelect}
              className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {content}
            </button>
          </>
        )}
      </div>
      {children}
    </li>
  );
}

/** A selected song's buttons: move up, move down, to another part, remove. */
function SongTools({
  draft,
  entry,
  partLabel,
  onChange,
}: {
  draft: Draft;
  entry: DraftEntry;
  partLabel: (index: number) => string;
  onChange: (next: Draft, keepSelected?: boolean) => void;
}) {
  const { t } = useTranslation();
  const at = findEntry(draft, entry.key);
  if (!at) return null;
  const first = at.part === 0 && at.index === 0;
  const last = at.part === draft.length - 1 && at.index === (draft[at.part]?.songs.length ?? 0) - 1;
  const tool =
    "flex h-auto min-h-12 flex-col gap-1 whitespace-normal px-1 py-2 text-xs [&_svg]:size-4";
  return (
    <div
      role="toolbar"
      aria-label={entry.song.title}
      className="grid grid-cols-4 gap-1.5 px-2 pb-2"
    >
      <Button
        variant="secondary"
        className={tool}
        disabled={first}
        onClick={() => onChange(moveStep(draft, entry.key, -1))}
      >
        <ArrowUp />
        {t("setlists.editor.moveUp")}
      </Button>
      <Button
        variant="secondary"
        className={tool}
        disabled={last}
        onClick={() => onChange(moveStep(draft, entry.key, 1))}
      >
        <ArrowDown />
        {t("setlists.editor.moveDown")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className={tool} disabled={draft.length < 2}>
            <ListPlus />
            {t("setlists.editor.toPart")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("setlists.editor.toPartLabel")}</DropdownMenuLabel>
          {draft.map((part, index) =>
            index === at.part ? null : (
              <DropdownMenuItem
                key={part.key}
                onSelect={() => onChange(moveTo(draft, entry.key, index))}
              >
                {partLabel(index)}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="secondary"
        className={cn(tool, "text-destructive")}
        onClick={() => onChange(removeSong(draft, entry.key), false)}
      >
        <Trash2 />
        {t("setlists.editor.remove")}
      </Button>
    </div>
  );
}
