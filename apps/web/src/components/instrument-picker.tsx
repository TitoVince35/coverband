import { type Instrument, instrumentLabel, toInstrument } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstrumentIcon } from "@/components/instrument-icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useLanguage } from "@/i18n/use-language";
import { pickerOptions } from "@/lib/instrument-picker";
import { instrumentSuggestionsQuery } from "@/lib/instruments";
import { cn } from "@/lib/utils";

type Props = {
  /** For the field's `<label htmlFor>`. */
  id: string;
  value: Instrument | null;
  onChange: (instrument: Instrument | null) => void;
  /** Instruments already chosen elsewhere, left out of the list. */
  exclude?: readonly Instrument[];
  "aria-describedby"?: string | undefined;
  autoFocus?: boolean;
};

/**
 * Picks one instrument (reusable: musicians now, sheet music and media later). A combobox: the
 * list shows every instrument with its icon, typing filters it (both languages, synonyms), and
 * text that matches nothing can be kept as a custom instrument. Leaving the field with typed text
 * keeps it too (a known instrument when it names one).
 */
export function InstrumentPicker({ id, value, onChange, exclude, autoFocus, ...aria }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const listId = useId();
  const suggestions = useQuery(instrumentSuggestionsQuery).data ?? [];
  const [text, setText] = useState(value ? instrumentLabel(value, language) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const options = pickerOptions(text, language, suggestions, exclude);
  const current = options[Math.min(active, options.length - 1)];

  function choose(instrument: Instrument) {
    onChange(instrument);
    setText(instrumentLabel(instrument, language));
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((index) => (index + step + options.length) % Math.max(options.length, 1));
    } else if (event.key === "Enter" && open && current) {
      event.preventDefault();
      choose(current.instrument);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <Popover open={open && options.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative">
          {value && (
            <InstrumentIcon
              instrument={value}
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground"
            />
          )}
          <Input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && current ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder={t("instruments.picker.placeholder")}
            className={cn(value && "pl-9")}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              setOpen(true);
              if (value) onChange(null);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              if (!value) {
                const typed = toInstrument(text);
                if (typed) choose(typed);
              }
            }}
            onKeyDown={onKeyDown}
            {...aria}
          />
        </div>
      </PopoverAnchor>
      {/* In a portal: never clipped by a card or a dialog. Focus stays in the input. */}
      <PopoverContent
        align="start"
        className="max-h-64 w-(--radix-popover-trigger-width) gap-0 overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (anchor.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <div id={listId} role="listbox">
          {options.map((option, index) => (
            <div
              key={option.custom ? "custom" : option.label}
              id={`${listId}-${index}`}
              role="option"
              // Focus stays in the input (aria-activedescendant); arrows move the highlight.
              tabIndex={-1}
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                index === active && "bg-accent text-accent-foreground",
              )}
              // Before the input's blur, so the click still lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option.instrument)}
              onKeyDown={(event) => event.key === "Enter" && choose(option.instrument)}
            >
              <InstrumentIcon instrument={option.instrument} />
              {option.custom ? t("instruments.picker.add", { label: option.label }) : option.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
