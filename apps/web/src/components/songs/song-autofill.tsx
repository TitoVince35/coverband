import { formatDuration } from "@coverband/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ProviderIcon } from "@/components/songs/provider-icon";
import type { Autofill } from "@/lib/autofill";
import { cn } from "@/lib/utils";

/**
 * What "I feel lucky" found for a new song (#201): Deezer's track (its album, duration and genre
 * fill the song in), and YouTube's best videos to choose from, or none.
 */
export function AutofillResults({
  result,
  chosen,
  onChoose,
}: {
  result: Autofill;
  /** The chosen video's id; null: no video. */
  chosen: string | null;
  onChoose: (videoId: string | null) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  const { track, videos } = result;
  if (!track && !videos?.length) {
    return <p className="text-muted-foreground text-sm">{t("songs.lucky.nothing")}</p>;
  }
  const details = (parts: (string | null)[]) => parts.filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      {track && (
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ProviderIcon url={track.url} className="size-4" />
            {t("songs.lucky.deezer")}
          </p>
          <p className="text-muted-foreground">
            {details([
              track.album,
              track.duration !== null ? formatDuration(track.duration) : null,
              track.genre,
            ])}
          </p>
        </div>
      )}
      {videos === null ? (
        <p className="text-muted-foreground text-sm">{t("songs.lucky.noYoutube")}</p>
      ) : (
        videos.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-sm">{t("songs.lucky.videos")}</legend>
            {videos.map((video) => (
              <label
                key={video.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg p-2 ring-1 ring-border has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  chosen === video.id && "bg-muted ring-2 ring-primary",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  checked={chosen === video.id}
                  onChange={() => onChoose(video.id)}
                  className="sr-only"
                />
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="aspect-video w-24 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="line-clamp-2 font-medium">{video.title}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {details([
                      video.channel,
                      video.duration !== null ? formatDuration(video.duration) : null,
                    ])}
                  </span>
                </span>
              </label>
            ))}
            <label
              className={cn(
                "flex cursor-pointer items-center rounded-lg p-2 text-sm ring-1 ring-border has-focus-visible:ring-2 has-focus-visible:ring-ring",
                chosen === null && "bg-muted ring-2 ring-primary",
              )}
            >
              <input
                type="radio"
                name={name}
                checked={chosen === null}
                onChange={() => onChoose(null)}
                className="sr-only"
              />
              {t("songs.lucky.noVideo")}
            </label>
          </fieldset>
        )
      )}
      <p className="text-muted-foreground text-xs">{t("songs.lucky.hint")}</p>
    </div>
  );
}
