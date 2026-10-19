import { formatDuration, keyLabel } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SongFormDialog } from "@/components/songs/song-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/i18n/use-language";
import { ApiRequestError, errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { songQuery } from "@/lib/songs";

// A song of the repertoire (#88): what the band knows about it; any member edits it.
export const Route = createFileRoute("/_app/b/$bandSlug/songs/$songId")({
  component: SongPage,
});

function SongPage() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { bandSlug, songId } = Route.useParams();
  const song = useQuery(songQuery(bandSlug, songId));

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

  const { title, artist, addedBy, createdAt, notes, ...fields } = song.data;
  // What the band knows, in the order it's looked for; unknown fields are left out.
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
  ].filter((detail) => detail.value);
  const date = formatDate(createdAt, language);

  return (
    <section className="space-y-4">
      {back}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-heading font-semibold text-xl">{title}</h2>
          <p className="text-muted-foreground">{artist}</p>
        </div>
        <SongFormDialog
          bandSlug={bandSlug}
          song={song.data}
          tooltip={t("songs.edit")}
          trigger={
            <Button variant="outline" size="icon-lg" aria-label={t("songs.edit")}>
              <Pencil />
            </Button>
          }
        />
      </div>
      {details.length > 0 && (
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              {details.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="break-words font-medium text-lg tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
      {notes && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t("songs.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap break-words">{notes}</p>
          </CardContent>
        </Card>
      )}
      <p className="text-muted-foreground text-xs">
        {addedBy ? t("songs.addedBy", { name: addedBy, date }) : t("songs.addedOn", { date })}
      </p>
    </section>
  );
}
