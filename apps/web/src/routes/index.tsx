import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await ensureOk(await api.health.$get())).json(),
  });

  const status = health.isPending
    ? t("home.apiChecking")
    : health.isError
      ? t("home.apiUnreachable")
      : t("home.apiOk");

  return (
    <section className="space-y-4">
      <h1 className="font-bold text-2xl tracking-tight">{t("home.title")}</h1>
      <p className="text-muted-foreground">{t("home.tagline")}</p>
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <span>{t("home.apiStatus", { status })}</span>
        <Button variant="outline" size="sm" onClick={() => health.refetch()}>
          {t("home.checkAgain")}
        </Button>
      </div>
    </section>
  );
}
