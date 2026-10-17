import { APP_NAME } from "@coverband/shared";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { LanguageToggle } from "@/components/language-toggle";
import { MailpitLink } from "@/components/mailpit-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/user-menu";

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
            <Link to="/" className="flex items-center gap-2 font-heading font-semibold text-lg">
              <img src="/logo.svg" alt="" className="size-7" />
              {APP_NAME}
            </Link>
            <div className="ml-auto flex items-center gap-1">
              {/* Statically false in production builds, so the link is left out. */}
              {import.meta.env.DEV && <MailpitLink />}
              <LanguageToggle />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
        <Toaster position="top-center" />
      </div>
    </TooltipProvider>
  );
}
