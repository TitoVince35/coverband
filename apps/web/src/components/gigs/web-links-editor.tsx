import { VENUE_MAX_LENGTH, type WebLink } from "@coverband/shared";
import { ExternalLink, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** An address as typed: `https://` added when the scheme is missing. */
export function withScheme(text: string) {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Whether a typed address is a web one (http or https). */
export function isWebAddress(text: string) {
  try {
    const url = new URL(withScheme(text));
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** A link's text: its title, else its address without the scheme. */
export const linkLabel = (link: WebLink) =>
  link.title ?? link.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/**
 * A list of web links (a venue's, a gig's program): each opens in a new tab and can be removed; a
 * new one is typed as an address and an optional title.
 */
export function WebLinksEditor({
  label,
  links,
  onChange,
  max,
  disabled,
}: {
  label: string;
  links: readonly WebLink[];
  onChange: (links: WebLink[]) => void;
  max: number;
  disabled?: boolean | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  // A link appears once: the same address again isn't added.
  const valid = isWebAddress(url) && !links.some((link) => link.url === withScheme(url));

  const add = () => {
    if (!valid) return;
    onChange([...links, { url: withScheme(url), title: title.trim() || null }]);
    setUrl("");
    setTitle("");
    setAdding(false);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-medium text-sm">{label}</legend>
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link, index) => (
            // A link appears once: its address is its key.
            <li key={link.url} className="flex min-w-0 items-center gap-2">
              <ExternalLink aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-primary text-sm underline-offset-4 hover:underline"
              >
                {linkLabel(link)}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={t("gigs.links.remove", { link: linkLabel(link) })}
                onClick={() => onChange(links.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="space-y-2 rounded-xl border p-3">
          <Input
            id={`${id}-url`}
            aria-label={t("gigs.links.url")}
            placeholder={t("gigs.links.urlPlaceholder")}
            inputMode="url"
            autoComplete="off"
            value={url}
            maxLength={VENUE_MAX_LENGTH.url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Input
            aria-label={t("gigs.links.title")}
            placeholder={t("gigs.links.titlePlaceholder")}
            value={title}
            maxLength={VENUE_MAX_LENGTH.linkTitle}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="secondary" disabled={!valid} onClick={add}>
              {t("gigs.links.add")}
            </Button>
          </div>
        </div>
      ) : (
        links.length < max && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <Plus />
            {t("gigs.links.addButton")}
          </Button>
        )
      )}
    </fieldset>
  );
}
