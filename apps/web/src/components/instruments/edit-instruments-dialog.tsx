import { type Instrument, instrumentLabel } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { InstrumentIcon } from "@/components/instrument-icon";
import { InstrumentPicker } from "@/components/instrument-picker";
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
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/use-language";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { instrumentKey } from "@/lib/instrument-picker";

/** Same limit as the API. */
const MAX_INSTRUMENTS = 10;

/**
 * Your own instruments in a band (#77), from your row of the lineup: remove with ✕, add with the
 * picker, save. The first is your main instrument.
 */
export function EditInstrumentsDialog({
  band,
  instruments,
}: {
  band: { name: string; slug: string };
  instruments: readonly Instrument[];
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Instrument[]>([...instruments]);
  // What's typed in the picker, not added yet: Save keeps it too.
  const [typed, setTyped] = useState<Instrument | null>(null);
  // A new picker after each addition: empty again, ready for the next one.
  const [pickerKey, setPickerKey] = useState(0);

  const save = useMutation({
    mutationFn: async (json: { instruments: Instrument[] }) =>
      (
        await ensureOk(
          await api.bands[":bandSlug"].members.me.instruments.$put({
            param: { bandSlug: band.slug },
            json,
          }),
        )
      ).json(),
    onSuccess: async () => {
      toast.success(t("lineup.instruments.saved"));
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["bands"] });
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setList([...instruments]);
      setTyped(null);
    } else save.reset();
  }

  /** The list with an instrument added at the end, unless it's already there. */
  const withAdded = (current: Instrument[], instrument: Instrument | null) =>
    !instrument || current.some((i) => instrumentKey(i) === instrumentKey(instrument))
      ? current
      : [...current, instrument];

  function add(instrument: Instrument) {
    setList((previous) => withAdded(previous, instrument));
    setTyped(null);
    setPickerKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("lineup.instruments.edit")}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">{t("lineup.instruments.title")}</DialogTitle>
          <DialogDescription>
            {t("lineup.instruments.description", { band: band.name })}
          </DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("lineup.instruments.none")}</p>
        ) : (
          <ul className="space-y-1">
            {list.map((instrument, index) => {
              const label = instrumentLabel(instrument, language);
              return (
                <li
                  key={instrumentKey(instrument)}
                  className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5"
                >
                  <InstrumentIcon instrument={instrument} />
                  <span className="flex-1 text-sm">{label}</span>
                  {index === 0 && (
                    <span className="text-muted-foreground text-xs">
                      {t("lineup.instruments.main")}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("lineup.instruments.remove", { label })}
                    onClick={() => setList((previous) => previous.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {list.length < MAX_INSTRUMENTS && (
          <div className="space-y-2">
            <Label htmlFor="add-instrument">{t("lineup.instruments.add")}</Label>
            <AddInstrument
              key={pickerKey}
              typed={typed}
              onType={setTyped}
              exclude={list}
              onAdd={add}
              // After an addition, the new empty field keeps the focus (and a phone its keyboard).
              autoFocus={pickerKey > 0}
            />
          </div>
        )}
        {save.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, save.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            onClick={() => save.mutate({ instruments: withAdded(list, typed) })}
            disabled={save.isPending}
          >
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The picker in "add" mode: typing doesn't add anything; choosing from the list, or Enter on the
 * typed text, does.
 */
function AddInstrument({
  typed,
  onType,
  exclude,
  onAdd,
  autoFocus,
}: {
  typed: Instrument | null;
  onType: (instrument: Instrument | null) => void;
  exclude: readonly Instrument[];
  onAdd: (instrument: Instrument) => void;
  autoFocus: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (typed) onAdd(typed);
      }}
    >
      <InstrumentPicker
        id="add-instrument"
        value={typed}
        exclude={exclude}
        onChange={onType}
        onPick={onAdd}
        autoFocus={autoFocus}
      />
    </form>
  );
}
