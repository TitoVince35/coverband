import { CONTACT_MESSAGE, CONTACT_SUBJECTS, type ContactSubject } from "@coverband/shared";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/use-language";
import { sendContact } from "@/lib/contact";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { safeRedirect } from "@/lib/redirect";

// "Contact us" (#234): a message to the app's team, from the account menu. `from`: the page the
// user came from, sent with a bug report and opened again once sent.
export const Route = createFileRoute("/_app/contact")({
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    const from = safeRedirect(search.from);
    return from ? { from } : {};
  },
  component: ContactPage,
});

function ContactPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const language = useLanguage();
  const { user } = Route.useRouteContext();
  const { from } = Route.useSearch();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const [subject, setSubject] = useState<ContactSubject | "">("");
  const [message, setMessage] = useState("");
  const [missingSubject, setMissingSubject] = useState(false);

  const send = useMutation({
    mutationFn: sendContact,
    onSuccess: async () => {
      toast.success(t("contact.sent"));
      router.history.push(from ?? "/");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The select has no default: a subject is chosen, never left as the first one.
    if (!subject) {
      setMissingSubject(true);
      return;
    }
    send.mutate({
      subject,
      message,
      language,
      ...(subject === "bug" && from && { page: from }),
    });
  }

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t("contact.title")}</CardTitle>
          <CardDescription>
            {t("contact.sentAs", { name: user.name, email: user.email })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-subject">{t("contact.subject")}</Label>
              <Select
                value={subject}
                onValueChange={(value) => {
                  setSubject(value as ContactSubject);
                  setMissingSubject(false);
                }}
              >
                <SelectTrigger
                  id="contact-subject"
                  className="w-full"
                  aria-invalid={missingSubject}
                  aria-describedby={missingSubject ? "contact-subject-error" : undefined}
                >
                  <SelectValue placeholder={t("contact.choose")} />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_SUBJECTS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(`contact.subjects.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {missingSubject && (
                <p id="contact-subject-error" role="alert" className="text-destructive text-xs">
                  {t("contact.subjectMissing")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">{t("contact.message")}</Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={CONTACT_MESSAGE.min}
                maxLength={CONTACT_MESSAGE.max}
                className="min-h-40"
                required
              />
              {subject === "bug" && (
                <p className="text-muted-foreground text-xs">{t("contact.bugContext")}</p>
              )}
            </div>
            {send.isError && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(t, send.error)}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={!online} pending={send.isPending}>
                {send.isPending ? t("contact.sending") : t("contact.send")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
