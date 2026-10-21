import { ADMIN_ROLE } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminUsersQuery } from "@/lib/admin";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";

export function UsersList() {
  const { t, i18n } = useTranslation();
  const users = useQuery(adminUsersQuery);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("admin.users.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {users.isPending ? (
          <ListSkeleton />
        ) : users.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, users.error)}
          </p>
        ) : (
          <ul className="divide-y">
            {users.data.map((user) => (
              <li key={user.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.name}</span>
                  {user.role === ADMIN_ROLE && <Badge>{t("admin.users.admin")}</Badge>}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {user.email}
                  {" · "}
                  {t("admin.users.joined", { date: formatDate(user.createdAt, i18n.language) })}
                </p>
                {user.bands.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {user.bands.map((band) => (
                      <Badge key={band.bandSlug} variant="outline">
                        {t("admin.users.roleInBand", {
                          band: band.bandName,
                          role: t(`band.roles.${band.role}`),
                        })}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
