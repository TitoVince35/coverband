import { keyLabel, MAJOR_KEYS, MINOR_KEYS, type MusicalKey } from "@coverband/shared";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/i18n/use-language";

/** Value of "no key" (a Radix select item can't have an empty value). */
export const NO_KEY = "none";

type Props = { id: string; name: string; defaultValue: MusicalKey | null };

/** Picks a musical key, major or minor, or none. Its form value is the key's code or NO_KEY. */
export function KeySelect({ id, name, defaultValue }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const groups = [
    { label: t("songs.keys.major"), keys: MAJOR_KEYS },
    { label: t("songs.keys.minor"), keys: MINOR_KEYS },
  ];
  return (
    <Select name={name} defaultValue={defaultValue ?? NO_KEY}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_KEY}>{t("songs.keys.none")}</SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.keys.map((key) => (
              <SelectItem key={key} value={key}>
                {keyLabel(key, language)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
