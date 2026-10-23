import { ADMIN_ROLE } from "@coverband/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { KeyRound, LogOut, MessageSquare, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessionAvatarUrl, UserAvatar } from "@/components/user-avatar";
import { authClient, sessionQuery } from "@/lib/auth";
import { contactQuery } from "@/lib/contact";
import { stopImpersonating } from "@/lib/impersonation";
import { clearUserData } from "@/lib/query-client";

/** Account menu in the header; hidden when logged out. */
export function UserMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery);
  // Offered when the server has a recipient for it (#234).
  const contact = useQuery({ ...contactQuery, enabled: Boolean(session) });
  // Where the user is: a bug report says it, and the form comes back to it.
  const here = useRouterState({ select: (state) => state.location.href });

  if (!session) {
    return null;
  }

  async function logout() {
    // An admin viewing the app as a user (#214): back to their own session first, which the
    // logout then ends (logging the user's session out would leave the admin's one behind).
    if (session?.session.impersonatedBy) await stopImpersonating();
    await authClient.signOut();
    clearUserData(queryClient);
    await router.navigate({ to: "/login" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("account.menu")}>
          <UserAvatar user={session.user} src={sessionAvatarUrl(session.user)} className="size-7" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <div className="font-medium text-foreground text-sm">{session.user.name}</div>
          <div>{session.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {session.user.role === ADMIN_ROLE && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <Shield />
              {t("admin.title")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/account">
            <KeyRound />
            {t("account.title")}
          </Link>
        </DropdownMenuItem>
        {contact.data && (
          <DropdownMenuItem asChild>
            <Link to="/contact" search={here.startsWith("/contact") ? {} : { from: here }}>
              <MessageSquare />
              {t("contact.title")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          {t("account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
