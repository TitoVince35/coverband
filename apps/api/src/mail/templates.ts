import type { Language } from "@coverband/shared";
import { type EmailContent, renderEmail } from "./layout";
import type { Mail } from "./mailer";

// One function per email: the texts for every language sit together, so a missing translation
// fails the typecheck.

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

/** Admin invites someone to create their band (#22); the link opens the leader wizard (#23). */
export function leaderInvitationEmail(
  to: string,
  language: Language,
  { inviterName, url }: { inviterName: string; url: string },
): Mail {
  const content: Record<Language, EmailContent> = {
    en: {
      subject: "Create your band on CoverBand",
      heading: "You're invited to create your band",
      paragraphs: [
        `${inviterName} invites you to create your band on CoverBand, the app to manage your repertoire, setlists and gigs.`,
        "This invitation is valid for 48 hours.",
      ],
      action: { label: "Create my band", url },
      footer: `You received this email because ${to} was invited to CoverBand. If you weren't expecting it, you can ignore it.`,
    },
    fr: {
      subject: "Créez votre groupe sur CoverBand",
      heading: "Invitation à créer votre groupe",
      paragraphs: [
        `${inviterName} vous invite à créer votre groupe sur CoverBand, l'application pour gérer votre répertoire, vos setlists et vos concerts.`,
        "Cette invitation est valable 48 heures.",
      ],
      action: { label: "Créer mon groupe", url },
      footer: `Vous recevez cet e-mail car ${to} a reçu une invitation sur CoverBand. Si vous ne vous y attendiez pas, vous pouvez l'ignorer.`,
    },
  };
  return build(to, language, content[language]);
}

/** A band leader invites a musician to join their band (#7). */
export function musicianInvitationEmail(
  to: string,
  language: Language,
  { inviterName, bandName, url }: { inviterName: string; bandName: string; url: string },
): Mail {
  const content: Record<Language, EmailContent> = {
    en: {
      subject: `Join ${bandName} on CoverBand`,
      heading: `${inviterName} invites you to join ${bandName}`,
      paragraphs: [
        `${inviterName} invites you to join ${bandName} on CoverBand, the app where your band shares its repertoire, setlists and gigs.`,
        "This invitation is valid for 48 hours.",
      ],
      action: { label: "Join the band", url },
      footer: `You received this email because ${to} was invited to CoverBand. If you weren't expecting it, you can ignore it.`,
    },
    fr: {
      subject: `Rejoignez ${bandName} sur CoverBand`,
      heading: `${inviterName} vous invite à rejoindre ${bandName}`,
      paragraphs: [
        `${inviterName} vous invite à rejoindre ${bandName} sur CoverBand, l'application où votre groupe partage son répertoire, ses setlists et ses concerts.`,
        "Cette invitation est valable 48 heures.",
      ],
      action: { label: "Rejoindre le groupe", url },
      footer: `Vous recevez cet e-mail car ${to} a reçu une invitation sur CoverBand. Si vous ne vous y attendiez pas, vous pouvez l'ignorer.`,
    },
  };
  return build(to, language, content[language]);
}
