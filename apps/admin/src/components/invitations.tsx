import { LANGUAGES, type Language } from "@coverband/shared";
import { useMutation } from "@tanstack/react-query";
import { MailPlus, RotateCw, X } from "lucide-react";
import { useDataProvider, useNotify, useRecordContext, useRefresh } from "ra-core";
import { useState } from "react";
import { Confirm } from "@/components/admin/confirm";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { Badge } from "@/components/ui/badge";
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

type Invitation = {
  id: string;
  email: string;
  language: Language;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "expired";
};

/** Invites a band leader (#250): an email with a link to create their band, valid 48 hours. */
function InviteButton() {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<Language>("fr");
  const invite = useMutation({
    mutationFn: () => dataProvider.create("invitations", { data: { email, language } }),
    onSuccess: () => {
      setOpen(false);
      notify(`Invitation sent to ${email.trim().toLowerCase()}`, { type: "success" });
      refresh();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  return (
    <>
      <Button
        onClick={() => {
          setEmail("");
          setOpen(true);
        }}
      >
        <MailPlus />
        Invite a band leader
      </Button>
      <Dialog open={open} onOpenChange={(next) => !invite.isPending && setOpen(next)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite a band leader</DialogTitle>
              <DialogDescription>
                They'll receive an email to create their band. The link is valid for 48 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-language">Email's language</Label>
              <select
                id="invite-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {Object.entries(LANGUAGES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={invite.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Status() {
  const invitation = useRecordContext<Invitation>();
  if (!invitation) return null;
  return invitation.status === "expired" ? (
    <Badge variant="outline">Expired</Badge>
  ) : (
    <Badge variant="secondary">Pending</Badge>
  );
}

/** Sending again (a new link, 48 more hours) and revoking (the link stops working). */
function RowActions() {
  const invitation = useRecordContext<Invitation>();
  const dataProvider = useDataProvider<AdminDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [revoking, setRevoking] = useState(false);
  const onError = (error: Error) => notify(error.message, { type: "error" });
  const resend = useMutation({
    mutationFn: (id: string) => dataProvider.resendInvitation(id),
    onSuccess: () => {
      notify(`Invitation sent again to ${invitation?.email}`, { type: "success" });
      refresh();
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (invitation: Invitation) =>
      dataProvider.delete("invitations", { id: invitation.id, previousData: invitation }),
    onSuccess: () => {
      setRevoking(false);
      notify("Invitation revoked", { type: "success" });
      refresh();
    },
    onError,
  });
  if (!invitation) return null;
  return (
    // The row opens nothing: clicks here stay here.
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the row's click.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the buttons inside handle the keyboard.
    <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        disabled={resend.isPending}
        onClick={() => resend.mutate(invitation.id)}
      >
        <RotateCw />
        Send again
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setRevoking(true)}>
        <X />
        Revoke
      </Button>
      <Confirm
        isOpen={revoking}
        loading={revoke.isPending}
        title={`Revoke the invitation to ${invitation.email}?`}
        content="Its link stops working."
        confirm="Revoke"
        confirmColor="warning"
        onConfirm={() => revoke.mutate(invitation)}
        onClose={() => setRevoking(false)}
      />
    </div>
  );
}

/** Band leader invitations still open (#250): pending or expired, newest first. */
export function InvitationList() {
  return (
    <List
      title="Band leader invitations"
      exporter={false}
      actions={<InviteButton />}
      pagination={false}
      empty={false}
    >
      <DataTable bulkActionButtons={false} rowClick={false}>
        <DataTable.Col source="email" label="Email" disableSort />
        <DataTable.Col source="language" label="Language" disableSort />
        <DataTable.Col source="invitedBy" label="Invited by" disableSort />
        <DataTable.Col source="createdAt" label="Sent" disableSort>
          <DateField source="createdAt" showTime />
        </DataTable.Col>
        <DataTable.Col label="Status" disableSort>
          <Status />
        </DataTable.Col>
        <DataTable.Col label="" disableSort>
          <RowActions />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
