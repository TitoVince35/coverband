import type { ContactSubject, Language } from "@coverband/shared";
import { contactEmail } from "../../adapters/mail/templates";
import { recordActivity } from "../../core/activity/record";
import type { AppDeps } from "../../deps";

export type ContactMessage = {
  subject: ContactSubject;
  message: string;
  page?: string | undefined;
  language: Language;
};

/**
 * Sends a user's message to the app's team (#234). A bug report carries its context: the running
 * version (the server's), the page and language the web app sends, the browser (the request's
 * User-Agent). Recorded once the email has gone out, with the subject's code only; a failed send
 * throws (a 500) and records nothing.
 */
export async function sendContactMessage(
  { db, mailer, buildInfo }: Pick<AppDeps, "db" | "mailer" | "buildInfo">,
  recipient: string,
  sender: { id: string; name: string; email: string },
  { subject, message, page, language }: ContactMessage,
  browser: string | null,
) {
  await mailer.send(
    contactEmail(recipient, {
      subject,
      message,
      sender,
      ...(subject === "bug" && {
        context: {
          version: `${buildInfo.version} (${buildInfo.build})`,
          page: page ?? null,
          browser,
          language,
        },
      }),
    }),
  );
  await recordActivity(db, {
    action: "contact.sent",
    bandId: null,
    actorId: sender.id,
    target: { type: "user", id: sender.id },
    data: { subject },
  });
}
