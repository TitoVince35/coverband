import type { Language } from "@coverband/shared";
import { type EmailContent, renderEmail } from "./layout";
import type { Mail } from "./mailer";

// One function per email: the texts for every language sit together, so a missing translation
// fails the typecheck. Invitation and password reset emails come with #22, #23, #7 and #24.

function build(to: string, language: Language, content: EmailContent): Mail {
  return { to, subject: content.subject, ...renderEmail(language, content) };
}

/** Checks the email setup end to end (`bun run mail:test`). */
export function testEmail(to: string, language: Language, appUrl: string): Mail {
  const content: Record<Language, EmailContent> = {
    en: {
      subject: "CoverBand test email",
      heading: "Email sending works",
      paragraphs: [
        "This is a test email from CoverBand.",
        "If you can read it, the setup is right.",
      ],
      action: { label: "Open CoverBand", url: appUrl },
      footer: "You received this email because someone tested CoverBand's email setup.",
    },
    fr: {
      subject: "E-mail de test CoverBand",
      heading: "L'envoi d'e-mails fonctionne",
      paragraphs: [
        "Ceci est un e-mail de test de CoverBand.",
        "Si vous pouvez le lire, la configuration est bonne.",
      ],
      action: { label: "Ouvrir CoverBand", url: appUrl },
      footer:
        "Vous recevez cet e-mail car quelqu'un a testé la configuration d'envoi de CoverBand.",
    },
  };
  return build(to, language, content[language]);
}
