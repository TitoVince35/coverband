import { ADMIN_ROLE, type Instrument, instrumentLabel } from "@coverband/shared";
import { useMutation } from "@tanstack/react-query";
import { Ban, CircleCheck, Eye, KeyRound, Star, Trash2 } from "lucide-react";
import { useDataProvider, useNotify, useRecordContext, useRedirect, useRefresh } from "ra-core";
import { useState } from "react";
import { Confirm } from "@/components/admin/confirm";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Show } from "@/components/admin/show";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminDataProvider } from "@/lib/data-provider";

type UserBand = { id: string; name: string; slug: string; role: string };

type UserRow = {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  banned: boolean;
  createdAt: string;
  bands: UserBand[];
  instruments: Instrument[];
};

type UserDetails = UserRow & {
  nickname: string | null;
  lastSessionAt: string | null;
  pendingInvitations: { id: string; role: string; band: string | null; expiresAt: string }[];
  impersonateUrl: string | null;
};

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** A user's bands, a star for those they lead. */
function Bands({ bands }: { bands: UserBand[] }) {
  if (bands.length === 0) return <span className="text-muted-foreground">No band</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {bands.map((band) => (
        <Badge key={band.id} variant="outline">
          {band.role === "leader" && <Star aria-label="band leader" className="fill-current" />}
          {band.name}
        </Badge>
      ))}
    </span>
  );
}

const instruments = (list: Instrument[]) =>
  list.map((instrument) => instrumentLabel(instrument, "en")).join(", ");

function RowBands() {
  const user = useRecordContext<UserRow>();
  return user ? <Bands bands={user.bands} /> : null;
}

function RowInstruments() {
  const user = useRecordContext<UserRow>();
  return <>{user ? instruments(user.instruments) : null}</>;
}

/** "Admin" and "Blocked" badges. */
function RowFlags() {
  const user = useRecordContext<UserRow>();
  if (!user) return null;
  return (
    <span className="flex gap-1">
      {user.role === ADMIN_ROLE && <Badge>Admin</Badge>}
      {user.banned && <Badge variant="destructive">Blocked</Badge>}
    </span>
  );
}

/** Every user, whatever their band (#249): searched by email or name, filtered, by email. */
export function UserList() {
  return (
    <List
      filters={[<SearchInput key="q" source="q" placeholder="Search by email or name" alwaysOn />]}
      sort={{ field: "email", order: "ASC" }}
      exporter={false}
      actions={
        <div className="flex gap-2">
          {/* The kit's toggles fill their width (a sidebar's): here, side by side. */}
          <ToggleFilterButton
            label="Admins"
            value={{ admins: "true" }}
            className="w-auto border-border"
          />
          <ToggleFilterButton
            label="No band"
            value={{ bandless: "true" }}
            className="w-auto border-border"
          />
        </div>
      }
    >
      <DataTable bulkActionButtons={false} rowClick="show">
        <DataTable.Col source="email" label="Email" />
        <DataTable.Col source="firstName" label="First name" disableSort />
        <DataTable.Col source="lastName" label="Last name" disableSort />
        <DataTable.Col label="Bands" disableSort>
          <RowBands />
        </DataTable.Col>
        <DataTable.Col label="Instruments" disableSort>
          <RowInstruments />
        </DataTable.Col>
        <DataTable.Col label="" disableSort>
          <RowFlags />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading font-semibold text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** What an admin does to a user (#249): view the app as them, block, reset, delete. */
function UserActions({ user }: { user: UserDetails }) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();
  const [confirm, setConfirm] = useState<"ban" | "delete" | null>(null);
  const isAdmin = user.role === ADMIN_ROLE;
  const onError = (error: Error) => notify(error.message, { type: "error" });

  const ban = useMutation({
    mutationFn: () => dataProvider.setUserBanned(user.id, user.banned ? "unban" : "ban"),
    onSuccess: () => {
      setConfirm(null);
      notify(user.banned ? "User unblocked" : "User blocked", { type: "success" });
      refresh();
    },
    onError,
  });
  const reset = useMutation({
    mutationFn: () => dataProvider.sendPasswordReset(user.id),
    onSuccess: () => notify(`Password reset email sent to ${user.email}`, { type: "success" }),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => dataProvider.delete("users", { id: user.id, previousData: user }),
    onSuccess: () => {
      notify("User deleted", { type: "success" });
      redirect("list", "users");
    },
    onError: (error: Error) => {
      setConfirm(null);
      onError(error);
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {user.impersonateUrl && (
        <Button
          variant="outline"
          render={<a href={user.impersonateUrl} target="_blank" rel="noreferrer" />}
        >
          <Eye />
          View the app as this user
        </Button>
      )}
      <Button variant="outline" disabled={reset.isPending} onClick={() => reset.mutate()}>
        <KeyRound />
        Send a password reset email
      </Button>
      {!isAdmin && (
        <>
          <Button variant="outline" onClick={() => setConfirm("ban")}>
            {user.banned ? <CircleCheck /> : <Ban />}
            {user.banned ? "Unblock" : "Block"}
          </Button>
          <Button variant="destructive" onClick={() => setConfirm("delete")}>
            <Trash2 />
            Delete
          </Button>
        </>
      )}
      <Confirm
        isOpen={confirm === "ban"}
        loading={ban.isPending}
        title={user.banned ? `Unblock ${user.name}?` : `Block ${user.name}?`}
        content={
          user.banned
            ? "They can log in again."
            : "Their sessions end now, and they can't log in until unblocked."
        }
        confirm={user.banned ? "Unblock" : "Block"}
        confirmColor={user.banned ? "primary" : "warning"}
        onConfirm={() => ban.mutate()}
        onClose={() => setConfirm(null)}
      />
      <Confirm
        isOpen={confirm === "delete"}
        loading={remove.isPending}
        title={`Delete ${user.name} for good?`}
        content="Their account, sessions and band memberships go; what they did stays, without their name. This can't be undone."
        confirm="Delete for good"
        confirmColor="warning"
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function UserPage() {
  const user = useRecordContext<UserDetails | UserRow>();
  // react-admin first shows the list's row (no details) while the user's page loads.
  if (!user || !("lastSessionAt" in user)) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {user.email} · joined {DATE.format(new Date(user.createdAt))}
          {user.role === ADMIN_ROLE && <Badge>Admin</Badge>}
          {user.banned && <Badge variant="destructive">Blocked</Badge>}
        </p>
        <UserActions user={user} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Profile">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">First name</dt>
            <dd>{user.firstName ?? "—"}</dd>
            <dt className="text-muted-foreground">Last name</dt>
            <dd>{user.lastName ?? "—"}</dd>
            <dt className="text-muted-foreground">Nickname</dt>
            <dd>{user.nickname ?? "—"}</dd>
            <dt className="text-muted-foreground">Last session</dt>
            <dd>{user.lastSessionAt ? DATE_TIME.format(new Date(user.lastSessionAt)) : "Never"}</dd>
          </dl>
        </Section>
        <Section title="Bands">
          <Bands bands={user.bands} />
          {user.instruments.length > 0 && (
            <p className="mt-3 text-muted-foreground text-sm">
              Plays {instruments(user.instruments)}
            </p>
          )}
        </Section>
        <Section title="Pending invitations">
          {user.pendingInvitations.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2">
              {user.pendingInvitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.role === "leader" ? "To create a band" : `To join ${invitation.band}`}
                  <span className="text-muted-foreground text-sm">
                    {" "}
                    · until {DATE.format(new Date(invitation.expiresAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function UserTitle() {
  return <>{useRecordContext<UserRow>()?.name}</>;
}

/** A user's page (#249): profile, bands, invitations, and what an admin does to them. */
export function UserShow() {
  return (
    <Show actions={false} title={<UserTitle />}>
      <UserPage />
    </Show>
  );
}
