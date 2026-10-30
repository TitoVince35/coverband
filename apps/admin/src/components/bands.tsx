import { type Instrument, instrumentLabel } from "@coverband/shared";
import { useRecordContext } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Show } from "@/components/admin/show";
import { BandActions } from "@/components/band-actions";
import { StorageRing } from "@/components/storage-ring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type JournalEntry, journalSentence } from "@/lib/journal";

type BandRow = {
  id: string;
  name: string;
  disabledAt: string | null;
  members: number;
  leaders: { id: string; name: string }[];
};

type BandDetails = {
  id: string;
  name: string;
  disabledAt: string | null;
  genre: string | null;
  createdAt: string;
  lineup: {
    userId: string;
    name: string;
    role: string;
    instruments: Instrument[];
    joinedAt: string;
  }[];
  songs: number;
  documents: number;
  storage: { usedBytes: number; quotaBytes: number };
  journal: JournalEntry[];
};

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "Suspended" for a disabled band (#248), nothing for an active one. */
function Status() {
  const band = useRecordContext<BandRow>();
  return band?.disabledAt ? <Badge variant="destructive">Suspended</Badge> : null;
}

function Leaders() {
  const band = useRecordContext<BandRow>();
  if (!band?.leaders.length) return <span className="text-muted-foreground">None</span>;
  return <>{band.leaders.map((leader) => leader.name).join(", ")}</>;
}

/** Every band (#247): searched by name, sorted by name, creation date or member count. */
export function BandList() {
  return (
    <List
      filters={[<SearchInput key="q" source="q" placeholder="Search by name" alwaysOn />]}
      sort={{ field: "name", order: "ASC" }}
      exporter={false}
      actions={false}
    >
      <DataTable bulkActionButtons={false} rowClick="show">
        <DataTable.Col source="name" label="Band" />
        <DataTable.Col source="createdAt" label="Created">
          <DateField source="createdAt" />
        </DataTable.Col>
        <DataTable.Col label="Band leaders" disableSort>
          <Leaders />
        </DataTable.Col>
        <DataTable.NumberCol source="members" label="Members" />
        <DataTable.Col label="Status" disableSort>
          <Status />
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

function BandPage() {
  const band = useRecordContext<BandDetails | BandRow>();
  // react-admin first shows the list's row (no details) while the band's page loads.
  if (!band || !("lineup" in band)) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground">
          {band.genre ?? "No genre"} · created {DATE.format(new Date(band.createdAt))}
          {band.disabledAt && (
            <span className="ml-2 text-destructive">
              · suspended since {DATE.format(new Date(band.disabledAt))}
            </span>
          )}
        </p>
        <BandActions band={band} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Lineup">
          {band.lineup.length === 0 ? (
            <p className="text-muted-foreground">No members.</p>
          ) : (
            <ul className="space-y-3">
              {band.lineup.map((member) => (
                <li key={member.userId}>
                  <p className="font-medium">
                    {member.name}
                    {member.role === "leader" && (
                      <span className="ml-2 text-muted-foreground text-sm">band leader</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {member.instruments.map((i) => instrumentLabel(i, "en")).join(", ") ||
                      "No instruments"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Repertoire">
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">Songs</dt>
            <dd className="font-heading font-semibold text-xl tabular-nums">{band.songs}</dd>
            <dt className="text-muted-foreground">Documents</dt>
            <dd className="font-heading font-semibold text-xl tabular-nums">{band.documents}</dd>
          </dl>
        </Section>
        <Section title="Documents storage">
          <StorageRing used={band.storage.usedBytes} total={band.storage.quotaBytes} />
        </Section>
      </div>
      <Section title="Latest activity">
        {band.journal.length === 0 ? (
          <p className="text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ul className="space-y-2">
            {band.journal.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3">
                <span className="text-muted-foreground tabular-nums">
                  {DATE_TIME.format(new Date(entry.createdAt))}
                </span>
                <span>{journalSentence(entry)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function BandTitle() {
  return <>{useRecordContext<BandRow>()?.name}</>;
}

/** A band's page (#247): lineup, repertoire, storage out of its quota, latest activity. */
export function BandShow() {
  return (
    <Show actions={false} title={<BandTitle />}>
      <BandPage />
    </Show>
  );
}
