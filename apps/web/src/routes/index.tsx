import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.$get();
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      return res.json();
    },
  });

  return (
    <section className="space-y-4">
      <h1 className="font-bold text-2xl tracking-tight">Welcome to CoverBand</h1>
      <p className="text-muted-foreground">
        Repertoire, setlists and gigs for your band. Coming soon.
      </p>
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <span>
          API:{" "}
          {health.isPending ? "checking…" : health.isError ? "unreachable" : health.data.status}
        </span>
        <Button variant="outline" size="sm" onClick={() => health.refetch()}>
          Check again
        </Button>
      </div>
    </section>
  );
}
