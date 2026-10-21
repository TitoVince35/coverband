import type { Instrument } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { InstrumentListEditor, withAdded } from "@/components/instruments/instrument-list-editor";
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
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";

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
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Instrument[]>([...instruments]);
  // What's typed in the picker, not added yet: Save keeps it too.
  const [typed, setTyped] = useState<Instrument | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild disabled={!online}>
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
        <InstrumentListEditor
          id="add-instrument"
          list={list}
          onChange={setList}
          typed={typed}
          onType={setTyped}
          showMain
        />
        {save.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, save.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            onClick={() => save.mutate({ instruments: withAdded(list, typed) })}
            pending={save.isPending}
          >
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
