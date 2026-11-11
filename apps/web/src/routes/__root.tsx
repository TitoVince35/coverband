import { APP_NAME } from "@coverband/shared";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { DevLinks } from "@/components/dev-links";
import { LanguageToggle } from "@/components/language-toggle";
import { NavigationProgress } from "@/components/loading";
import { OfflineBanner } from "@/components/offline-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/user-menu";
import { accessQuery } from "@/lib/access";
import { useMediaQuery } from "@/lib/media-query";
import { isOpenPage } from "@/lib/open-pages";
import { guardData } from "@/lib/query-client";

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  // The beta access code (#148): without it, every page but the open ones shows the code screen.
  beforeLoad: async ({ context, location }) => {
    if (isOpenPage(location.pathname)) return;
    const access = await guardData(context.queryClient, accessQuery).catch(() => null);
    // Unreachable API (offline): let the page load and show its own error.
    if (access && !access.granted) {
      throw redirect({ to: "/access", search: { redirect: location.href } });
    }
  },
  component: RootLayout,
});

/** Where a toast sits on a phone: above the band's bottom bar (#223) and the phone's own bar. */
const ABOVE_BOTTOM_BAR = "calc(4.5rem + env(safe-area-inset-bottom))";

function RootLayout() {
  // Tailwind's `sm`, where the band's bottom bar gives way to tabs.
  const largeScreen = useMediaQuery("(min-width: 640px)");
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
            <Link to="/" className="flex items-center gap-2 font-heading font-semibold text-lg">
              <img src="/logo.svg" alt="" className="size-7" />
              {APP_NAME}
            </Link>
            <div className="ml-auto flex items-center gap-1">
              {/* Statically false in production builds, so the links are left out. */}
              {import.meta.env.DEV && <DevLinks />}
              <LanguageToggle />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <NavigationProgress />
        </header>
        <ImpersonationBanner />
        <OfflineBanner />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
        {/* At the bottom on a phone, above the band's bottom bar: at the top, a toast would cover
            the header's buttons for its 4 s. At the top on a larger screen. */}
        <Toaster
          position={largeScreen ? "top-center" : "bottom-center"}
          offset={{ bottom: ABOVE_BOTTOM_BAR }}
          mobileOffset={{ bottom: ABOVE_BOTTOM_BAR }}
        />
      </div>
    </TooltipProvider>
  );
}
