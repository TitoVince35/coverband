import { formatDuration, keyLabel } from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ArchivedBanner, SongActions } from "@/components/songs/song-actions";
import { SongFormDialog } from "@/components/songs/song-form-dialog";
import { SongLyrics } from "@/components/songs/song-lyrics";
import { SongMedia } from "@/components/songs/song-media";
import { SongNotes } from "@/components/songs/song-notes";
import { EnergyPicker, StatusPicker } from "@/components/songs/song-status";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/i18n/use-language";
import { bandQuery } from "@/lib/bands";
import { ApiRequestError, errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { type SongFields, songQuery, updateSong } from "@/lib/songs";
import { cn } from "@/lib/utils";

// A song of the repertoire (#88): what the band knows about it; any member edits it.
export const Route = createFileRoute("/_app/b/$bandSlug/songs/$songId")({
  component: SongPage,
});

function SongPage() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { bandSlug, songId } = Route.useParams();
  const song = useQuery(songQuery(bandSlug, songId));
  const isLeader = useQuery(bandQuery(bandSlug)).data?.membership.role === "leader";
  const queryClient = useQueryClient();
  // Status and energy change with a tap, saved at once.
  const change = useMutation({
    mutationFn: (json: Partial<Pick<SongFields, "status" | "energy">>) =>
      updateSong(bandSlug, songId, json),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] }),
  });

  const back = (
    <Link
      to="/b/$bandSlug/songs"
      params={{ bandSlug }}
      className="-ml-1 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
    >
      <ChevronLeft className="size-4" />
      {t("songs.back")}
    </Link>
  );

  if (song.isPending) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }
  if (song.isError) {
    const notFound = song.error instanceof ApiRequestError && song.error.code === "not_found";
    return (
      <section className="space-y-4">
        {back}
        <p role="alert" className="text-muted-foreground">
          {notFound ? t("songs.notFound") : errorMessage(t, song.error)}
        </p>
      </section>
    );
  }

  const { title, artist, addedBy, createdAt, notes, media, ...fields } = song.data;
  // One change at a time: a tap while one is saved is ignored (the controls stay focusable).
  const save = (json: Partial<Pick<SongFields, "status" | "energy">>) => {
    if (!change.isPending) change.mutate(json);
  };
  // While a change is saved, it already shows.
  const status = (change.isPending && change.variables.status) || fields.status;
  const energy =
    change.isPending && change.variables.energy !== undefined
      ? change.variables.energy
      : fields.energy;
  // What the band knows, in the order it's looked for; unknown fields show a dash.
  const details = [
    {
      label: t("songs.ownDuration"),
      value: fields.ownDuration !== null ? formatDuration(fields.ownDuration) : null,
    },
    {
      label: t("songs.standardDuration"),
      value: fields.standardDuration !== null ? formatDuration(fields.standardDuration) : null,
    },
    { label: t("songs.bandKey"), value: fields.bandKey && keyLabel(fields.bandKey, language) },
    { label: t("songs.key"), value: fields.key && keyLabel(fields.key, language) },
    { label: t("songs.tempo"), value: fields.tempo && t("songs.bpm", { tempo: fields.tempo }) },
    { label: t("songs.style"), value: fields.style },
  ];
  const date = formatDate(createdAt, language);

  return (
    <section className="space-y-4">
      {back}
      {song.data.archivedAt && <ArchivedBanner bandSlug={bandSlug} songId={songId} />}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-heading font-semibold text-xl">{title}</h2>
          <p className="text-muted-foreground">{artist}</p>
        </div>
        <SongFormDialog
          bandSlug={bandSlug}
          song={song.data}
          part="main"
          tooltip={t("songs.edit")}
          trigger={
            <Button variant="outline" size="icon-lg" aria-label={t("songs.edit")}>
              <Pencil />
            </Button>
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <StatusPicker
          value={status}
          onChange={(next) => save({ status: next })}
          busy={change.isPending}
        />
        <EnergyPicker
          value={energy}
          onChange={(next) => save({ energy: next })}
          busy={change.isPending}
        />
      </div>
      {change.isError && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, change.error)}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t("songs.details")}</CardTitle>
          <CardAction>
            <SongFormDialog
              bandSlug={bandSlug}
              song={song.data}
              part="details"
              tooltip={t("songs.editDetails")}
              trigger={
                <Button variant="outline" size="icon" aria-label={t("songs.editDetails")}>
                  <Pencil />
                </Button>
              }
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            {details.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground text-sm">{label}</dt>
                <dd
                  className={cn(
                    "break-words font-medium text-lg tabular-nums",
                    !value && "text-muted-foreground",
                  )}
                >
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <SongMedia bandSlug={bandSlug} songId={songId} media={media} />
      <SongLyrics bandSlug={bandSlug} songId={songId} lyrics={song.data.lyrics} />
      <SongNotes key={songId} bandSlug={bandSlug} songId={songId} notes={notes} />
      <p className="text-muted-foreground text-xs">
        {addedBy ? t("songs.addedBy", { name: addedBy, date }) : t("songs.addedOn", { date })}
      </p>
      <SongActions bandSlug={bandSlug} song={song.data} isLeader={isLeader} />
    </section>
  );
}
