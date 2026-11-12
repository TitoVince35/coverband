import { useMutation } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/use-language";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { fetchSetlistExport, saveFile, setlistExportUrl } from "@/lib/setlists";

type Props = { bandSlug: string; setlist: { id: string; title: string } };

/**
 * A setlist's exports (brief 030): Print opens the PDF in a new tab, where the browser prints it
 * (#298); "Export to docx" downloads a raw document to edit (#297). Made by the server, so turned
 * off offline (the offline banner says why).
 */
export function SetlistExports({ bandSlug, setlist }: Props) {
  const { t } = useTranslation();
  const online = useOnline();
  const language = useLanguage();

  const docx = useMutation({
    networkMode: "always",
    mutationFn: () => fetchSetlistExport(bandSlug, setlist.id, "docx", language),
    onSuccess: ({ blob, name }) => saveFile(blob, name ?? `${setlist.title}.docx`),
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  return (
    <div className="flex flex-wrap gap-2">
      {online ? (
        <Button asChild size="sm">
          <a
            href={setlistExportUrl(bandSlug, setlist.id, "pdf", language)}
            target="_blank"
            rel="noopener"
          >
            <Printer />
            {t("setlists.export.print")}
          </a>
        </Button>
      ) : (
        <Button size="sm" disabled>
          <Printer />
          {t("setlists.export.print")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!online}
        pending={docx.isPending}
        onClick={() => docx.mutate()}
      >
        <FileDown />
        {t("setlists.export.docx")}
      </Button>
    </div>
  );
}
