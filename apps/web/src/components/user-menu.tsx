import { ADMIN_ROLE } from "@coverband/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { CircleUser, KeyRound, LogOut, Shield } from "lucide-react";
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
import { authClient, sessionQuery } from "@/lib/auth";

/** Account menu in the header; hidden when logged out. */
export function UserMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery);

  if (!session) {
    return null;
  }

  async function logout() {
    await authClient.signOut();
    queryClient.setQueryData(sessionQuery.queryKey, null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
    await router.navigate({ to: "/login" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("account.menu")}>
          <CircleUser />
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
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          {t("account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
