import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./components/theme-provider";
import { accessQuery } from "./lib/access";
import { startAppUpdates } from "./lib/app-updates";
import { listenForInstall } from "./lib/install";
import { startOfflineCache } from "./lib/offline-cache";
import { listenForPushes } from "./lib/push";
import { createQueryClient, SESSION_KEY, watchGuardData } from "./lib/query-client";
import { installSlowNetwork } from "./lib/slow-network";
import { routeTree } from "./routeTree.gen";
import "./i18n";
import "./index.css";
import { LOADING_DELAY_MS, PageSpinner } from "./components/loading";

// A stale build reloads by itself (#164); the dev server has no service worker.
if (import.meta.env.PROD) startAppUpdates();

// Development only: the slow network switch of the dev tools (#197).
if (import.meta.env.DEV) installSlowNetwork();

// Chrome's install prompt comes once, early: listen before anything renders (#166).
listenForInstall();

const queryClient = createQueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // While a page's guards wait (the session, the access check: #190), after a short delay.
  defaultPendingComponent: PageSpinner,
  defaultPendingMs: LOADING_DELAY_MS,
});

// A guard's background check found another answer (#211): the guards run again, and redirect.
watchGuardData(queryClient, [SESSION_KEY, accessQuery.queryKey], () => void router.invalidate());
listenForPushes(queryClient);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

// TanStack Query starts online and only follows the browser's events: start from the real state.
onlineManager.setOnline(navigator.onLine);
// The saved data first (#165): offline, the first page's session check reads it.
await startOfflineCache(queryClient);

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
