import { type Instrument, instrumentLabel, toInstrument } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
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
  /** Called when an instrument is chosen from the list (not while typing): "add" pickers. */
  onPick?: (instrument: Instrument) => void;
  /** Instruments already chosen elsewhere, left out of the list. */
  exclude?: readonly Instrument[];
  "aria-describedby"?: string | undefined;
  autoFocus?: boolean;
};

/**
 * Picks one instrument (reusable: musicians now, sheet music and media later). A combobox: the
 * list shows every instrument with its icon, typing filters it (both languages, synonyms), and
 * text that matches nothing can be kept as a custom instrument. What's typed is the value as you
 * type (the known instrument once it names one, free text otherwise), so submitting a form with
 * Enter or a tap keeps it without waiting for the field to lose focus.
 */
export function InstrumentPicker({
  id,
  value,
  onChange,
  onPick,
  exclude,
  autoFocus,
  ...aria
}: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const listId = useId();
  const suggestions = useQuery(instrumentSuggestionsQuery).data ?? [];
  const label = (instrument: Instrument | null) =>
    instrument ? instrumentLabel(instrument, language) : "";
  const [text, setText] = useState(label(value));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const options = pickerOptions(text, language, suggestions, exclude);
  // One index for the highlight, aria-activedescendant and Enter, always within the list.
  const active = Math.min(highlight, Math.max(options.length - 1, 0));
  const current = options[active];

  // A value changed from outside (reset by the parent, another language): show it, unless the
  // user is typing in the field.
  // biome-ignore lint/correctness/useExhaustiveDependencies: label follows value and language.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(label(value));
  }, [value, language]);

  function show() {
    setHighlight(0);
    setOpen(true);
  }

  function choose(instrument: Instrument) {
    onChange(instrument);
    setText(label(instrument));
    setHighlight(0);
    setOpen(false);
    onPick?.(instrument);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + options.length) % Math.max(options.length, 1));
    } else if (event.key === "Enter" && open && current) {
      event.preventDefault();
      choose(current.instrument);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const listed = open && options.length > 0;
  return (
    <Popover open={listed} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative">
          {value && (
            <InstrumentIcon
              instrument={value}
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground"
            />
          )}
          <Input
            ref={input}
            id={id}
            role="combobox"
            aria-expanded={listed}
            aria-controls={listed ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={listed && current ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder={t("instruments.picker.placeholder")}
            className={cn(value && "pl-9")}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              onChange(toInstrument(event.target.value));
              show();
            }}
            onFocus={show}
            onClick={() => !open && show()}
            // Tidy what was typed: "bass" reads "Bass guitar" once you move on.
            onBlur={() => {
              setOpen(false);
              setText(label(value));
            }}
            onKeyDown={onKeyDown}
            {...aria}
          />
        </div>
      </PopoverAnchor>
      {/* In a portal: never clipped by a card or a dialog. Focus stays in the input. */}
      <PopoverContent
        align="start"
        className="max-h-[min(16rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) gap-0 overflow-y-auto p-1"
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
              onMouseEnter={() => setHighlight(index)}
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
