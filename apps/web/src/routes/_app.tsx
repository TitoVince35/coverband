import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQuery } from "@/lib/auth";
import { guardData } from "@/lib/query-client";

// Pathless layout for every page that needs a logged-in user. Public pages (login, and later
// invitations) live outside it.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await guardData(context.queryClient, sessionQuery);
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: session.user };
  },
  component: Outlet,
});
