import { createFileRoute } from "@tanstack/react-router";
import { LiveSetlist } from "@/components/setlists/live-setlist";

// A setlist live (brief 031): read-only, offline, over the whole app. Not inside the setlist's
// page, so the back button leaves it.
export const Route = createFileRoute("/_app/b/$bandSlug/setlists/$setlistId_/live")({
  component: LivePage,
});

function LivePage() {
  const { bandSlug, setlistId } = Route.useParams();
  return <LiveSetlist bandSlug={bandSlug} setlistId={setlistId} />;
}
