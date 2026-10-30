import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";
import { StorageRing } from "@/components/storage-ring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminDataProvider, AdminStats } from "@/lib/data-provider";

const NUMBER = new Intl.NumberFormat("en");

/** The homepage's number tiles, in order: what each shows. */
const TILES: { label: string; value: (stats: AdminStats) => number; hint?: string }[] = [
  { label: "Bands", value: (s) => s.bands },
  { label: "New bands this month", value: (s) => s.newBandsThisMonth },
  { label: "Users", value: (s) => s.users },
  { label: "Active users", value: (s) => s.activeUsers, hint: "A session in the last 30 days" },
  { label: "Songs", value: (s) => s.songs, hint: "Archived ones included" },
  { label: "Documents", value: (s) => s.documents },
  { label: "Pending invitations", value: (s) => s.pendingInvitations },
];

function Tile({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading font-semibold text-lg">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {children}
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** The admin console's homepage (#246): a few numbers to monitor. */
export function Dashboard() {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const { data, error } = useQuery({ queryKey: ["stats"], queryFn: () => dataProvider.stats() });

  return (
    <section className="space-y-6">
      <h1 className="font-bold text-2xl tracking-tight">Overview</h1>
      {error ? (
        <p role="alert" className="text-destructive">
          The numbers couldn't be loaded: {error.message}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TILES.map((tile) => (
            <Tile key={tile.label} label={tile.label} {...(tile.hint && { hint: tile.hint })}>
              {data ? (
                <p className="font-heading font-semibold text-3xl tabular-nums">
                  {NUMBER.format(tile.value(data))}
                </p>
              ) : (
                <Skeleton className="h-9 w-20" />
              )}
            </Tile>
          ))}
          <Tile label="Documents storage" hint="Out of every band's quota added up">
            {data ? (
              <StorageRing used={data.documentsBytes} total={data.documentsQuotaBytes} />
            ) : (
              <Skeleton className="size-16 rounded-full" />
            )}
          </Tile>
        </div>
      )}
    </section>
  );
}
