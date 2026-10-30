import { useMutation } from "@tanstack/react-query";
import { Ban, CircleCheck, Trash2 } from "lucide-react";
import { useDataProvider, useNotify, useRedirect, useRefresh } from "ra-core";
import { useState } from "react";
import { Confirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminDataProvider } from "@/lib/data-provider";

type Band = { id: string; name: string; disabledAt: string | null };

/**
 * A band's status and what an admin does with it (#248): disable (its members then only see that
 * it's suspended) or enable it again; delete it for good once disabled, its name typed to confirm.
 */
export function BandActions({ band }: { band: Band }) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const disabled = band.disabledAt !== null;

  const status = useMutation({
    mutationFn: () => dataProvider.setBandStatus(band.id, disabled ? "enable" : "disable"),
    onSuccess: () => {
      setConfirming(false);
      notify(disabled ? "Band enabled again" : "Band disabled", { type: "success" });
      refresh();
    },
    onError: (error) => notify(error.message, { type: "error" }),
  });
  const remove = useMutation({
    mutationFn: () =>
      dataProvider.delete("bands", { id: band.id, previousData: band, meta: { name: typed } }),
    onSuccess: () => {
      notify("Band deleted", { type: "success" });
      redirect("list", "bands");
    },
    onError: (error) => notify(error.message, { type: "error" }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => setConfirming(true)}>
        {disabled ? <CircleCheck /> : <Ban />}
        {disabled ? "Enable band" : "Disable band"}
      </Button>
      <Button
        variant="destructive"
        disabled={!disabled}
        title={disabled ? undefined : "Disable the band first"}
        onClick={() => {
          setTyped("");
          setDeleting(true);
        }}
      >
        <Trash2 />
        Delete band
      </Button>

      <Confirm
        isOpen={confirming}
        loading={status.isPending}
        title={disabled ? `Enable ${band.name}?` : `Disable ${band.name}?`}
        content={
          disabled
            ? "Its members get its pages back."
            : "Its members will only see that it's suspended, until it's enabled again."
        }
        confirm={disabled ? "Enable" : "Disable"}
        confirmColor={disabled ? "primary" : "warning"}
        onConfirm={() => status.mutate()}
        onClose={() => setConfirming(false)}
      />

      <Dialog open={deleting} onOpenChange={(open) => !remove.isPending && setDeleting(open)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim() === band.name) remove.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete {band.name} for good?</DialogTitle>
              <DialogDescription>
                Its songs, documents, logo, lineup and journal go with it: this can't be undone. Its
                members keep their accounts, and its name becomes free again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-band-name">Type the band's name to confirm</Label>
              <Input
                id="delete-band-name"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => setDeleting(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={typed.trim() !== band.name || remove.isPending}
              >
                Delete for good
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
