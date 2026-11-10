import { hoursAndMinutes, setlistDuration } from "@coverband/shared";
import type { TFunction } from "i18next";

/** A duration as the setlists show it: "1 h 52 min", "48 min"; "~" when songs have none. */
export function formatSetlistDuration(
  t: TFunction,
  { seconds, missing }: { seconds: number; missing: number },
) {
  const { hours, minutes } = hoursAndMinutes(seconds);
  const text = hours
    ? t("setlists.duration.hoursMinutes", { hours, minutes })
    : t("setlists.duration.minutes", { minutes });
  return missing > 0 ? t("setlists.duration.approx", { duration: text }) : text;
}

/** The duration of some songs, as `formatSetlistDuration` shows it. */
export const songsDuration = (
  t: TFunction,
  songs: readonly { standardDuration: number | null; ownDuration: number | null }[],
) => formatSetlistDuration(t, setlistDuration(songs));
