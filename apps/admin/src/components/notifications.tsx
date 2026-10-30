import { NOTIFICATION_TEXT_MAX_LENGTH, textParts } from "@coverband/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Eye, Megaphone, Send } from "lucide-react";
import { useDataProvider, useNotify, useRecordContext, useRefresh } from "ra-core";
import { useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TeamNote = {
  id: string;
  text: string;
  sentAt: string;
  sentBy: string | null;
  /** Users whose account existed when it was sent. */
  recipients: number;
  readers: number;
  /** Devices it was pushed to (#262), and those whose push service refused it. */
  devicesReached: number;
  devicesFailed: number;
};

/** "3 devices", "1 device". */
const devicesCount = (count: number) => `${count} device${count === 1 ? "" : "s"}`;

/** Who the main app says a note comes from (brief 025: written as is, not the app's name). */
const SIGNATURE = "The Coverband team";

/** A note's text as the main app shows it: line breaks kept, web addresses as links. */
function NoteText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {textParts(text).map((part, index) =>
        "url" in part ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts never move.
          <a key={index} href={part.url} target="_blank" rel="noreferrer" className="underline">
            {part.url}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts never move.
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * Writes a note from the team (#260), previews it as users will see it, then sends it to every
 * user: it can't be edited nor taken back.
 */
function SendNoteButton() {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () =>
      dataProvider.create<{
        id: string;
        devices: { reached: number; failed: number };
      }>("notifications", { data: { text } }),
    onSuccess: ({ data: { devices } }) => {
      setOpen(false);
      const failed = devices.failed ? `, ${devicesCount(devices.failed)} failed` : "";
      notify(`Note sent to every user, pushed to ${devicesCount(devices.reached)}${failed}`, {
        type: "success",
      });
      refresh();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  return (
    <>
      <Button
        onClick={() => {
          setText("");
          setPreviewing(false);
          setOpen(true);
        }}
      >
        <Megaphone />
        Write a note
      </Button>
      <Dialog open={open} onOpenChange={(next) => !send.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-xl">
          {previewing ? (
            <>
              <DialogHeader>
                <DialogTitle>Send this note to every user?</DialogTitle>
                <DialogDescription>
                  Devices with notifications on get it at once; everyone sees it the next time they
                  open the app, until they press OK. It can't be edited or taken back.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 rounded-xl border p-4">
                <p className="font-heading font-semibold">{SIGNATURE}</p>
                <NoteText text={text.trim()} />
                <div className="flex justify-end">
                  <Button size="sm" tabIndex={-1} aria-hidden>
                    OK
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  disabled={send.isPending}
                  onClick={() => setPreviewing(false)}
                >
                  <ArrowLeft />
                  Back
                </Button>
                <Button disabled={send.isPending} onClick={() => send.mutate()}>
                  <Send />
                  Send to all
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setPreviewing(true);
              }}
            >
              <DialogHeader>
                <DialogTitle>Write a note</DialogTitle>
                <DialogDescription>
                  A release note from "{SIGNATURE}", shown to every user in a window they close with
                  OK. Plain text, sent as typed: line breaks are kept, web addresses become links.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="note-text">Text</Label>
                <Textarea
                  id="note-text"
                  required
                  rows={10}
                  maxLength={NOTIFICATION_TEXT_MAX_LENGTH}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!text.trim()}>
                  <Eye />
                  Preview
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Readers() {
  const note = useRecordContext<TeamNote>();
  if (!note) return null;
  return (
    <span className="tabular-nums">
      {note.readers} of {note.recipients}
    </span>
  );
}

function Pushed() {
  const note = useRecordContext<TeamNote>();
  if (!note) return null;
  return (
    <span className="tabular-nums">
      {devicesCount(note.devicesReached)}
      {note.devicesFailed > 0 && (
        <span className="text-destructive"> ({note.devicesFailed} failed)</span>
      )}
    </span>
  );
}

function Excerpt() {
  const note = useRecordContext<TeamNote>();
  if (!note) return null;
  return <p className="line-clamp-3 max-w-xl whitespace-pre-wrap">{note.text}</p>;
}

/** Notes sent by the team (#260), newest first, with how many of their recipients read them. */
export function NotificationList() {
  return (
    <List
      title="Notifications"
      exporter={false}
      actions={<SendNoteButton />}
      sort={{ field: "sentAt", order: "DESC" }}
      empty={false}
    >
      <DataTable bulkActionButtons={false} rowClick={false}>
        <DataTable.Col source="sentAt" label="Sent" disableSort>
          <DateField source="sentAt" showTime />
        </DataTable.Col>
        <DataTable.Col source="text" label="Text" disableSort>
          <Excerpt />
        </DataTable.Col>
        <DataTable.Col source="sentBy" label="Sent by" disableSort />
        <DataTable.Col label="Pushed to" disableSort>
          <Pushed />
        </DataTable.Col>
        <DataTable.Col label="Read by" disableSort>
          <Readers />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
