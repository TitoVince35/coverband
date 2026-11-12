import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileDown, MonitorPlay, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/use-language";
import { errorMessage } from "@/lib/errors";
import { enterFullscreen } from "@/lib/live";
import { useOnline } from "@/lib/online";
import { fetchSetlistExport, saveFile, setlistExportUrl } from "@/lib/setlists";

type Props = {
  bandSlug: string;
  setlist: { id: string; title: string; version: number };
  /** False while the editor's changes aren't saved: an export would miss them. */
  saved?: boolean;
};

/**
 * A setlist's live mode (brief 031: Live, offline too) and exports (brief 030): Print opens the PDF in a new tab, where the browser prints it
 * (#298); "docx" downloads a raw document to edit (#297). Made by the server, so turned
 * off offline (the offline banner says why), and wait while changes are being saved.
 */
export function SetlistExports({ bandSlug, setlist, saved = true }: Props) {
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
      <Button asChild size="sm">
        <Link
          to="/b/$bandSlug/setlists/$setlistId/live"
          params={{ bandSlug, setlistId: setlist.id }}
          // Real full screen needs the tap itself (Android; an iPhone has none for a page).
          onClick={enterFullscreen}
        >
          <MonitorPlay />
          {t("setlists.live.button")}
        </Link>
      </Button>
      {online && saved ? (
        <Button asChild variant="outline" size="sm">
          <a
            href={setlistExportUrl(bandSlug, setlist.id, "pdf", language, setlist.version)}
            target="_blank"
            rel="noopener"
          >
            <Printer />
            {t("setlists.export.print")}
          </a>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled pending={online && !saved}>
          <Printer />
          {t("setlists.export.print")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!online || !saved}
        pending={docx.isPending}
        onClick={() => docx.mutate()}
      >
        <FileDown />
        {t("setlists.export.docx")}
      </Button>
    </div>
  );
}
