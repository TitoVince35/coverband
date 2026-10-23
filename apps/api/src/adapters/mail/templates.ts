import { APP_NAME, type ContactSubject, type Language } from "@coverband/shared";
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
      subject: `${APP_NAME} test email`,
      heading: "Email sending works",
      paragraphs: [
        `This is a test email from ${APP_NAME}.`,
        "If you can read it, the setup is right.",
      ],
      action: { label: `Open ${APP_NAME}`, url: appUrl },
      footer: `You received this email because someone tested ${APP_NAME}'s email setup.`,
    },
    fr: {
      subject: `E-mail de test ${APP_NAME}`,
      heading: "L'envoi d'e-mails fonctionne",
      paragraphs: [
        `Ceci est un e-mail de test de ${APP_NAME}.`,
        "Si vous pouvez le lire, la configuration est bonne.",
      ],
      action: { label: `Ouvrir ${APP_NAME}`, url: appUrl },
      footer: `Vous recevez cet e-mail car quelqu'un a testé la configuration d'envoi de ${APP_NAME}.`,
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
      subject: `Create your band on ${APP_NAME}`,
      heading: "You're invited to create your band",
      paragraphs: [
        `${inviterName} invites you to create your band on ${APP_NAME}, the app to manage your repertoire, setlists and gigs.`,
        "This invitation is valid for 48 hours.",
      ],
      action: { label: "Create my band", url },
      footer: `You received this email because ${to} was invited to ${APP_NAME}. If you weren't expecting it, you can ignore it.`,
    },
    fr: {
      subject: `Créez votre groupe sur ${APP_NAME}`,
      heading: "Invitation à créer votre groupe",
      paragraphs: [
        `${inviterName} vous invite à créer votre groupe sur ${APP_NAME}, l'application pour gérer votre répertoire, vos setlists et vos concerts.`,
        "Cette invitation est valable 48 heures.",
      ],
      action: { label: "Créer mon groupe", url },
      footer: `Vous recevez cet e-mail car ${to} a reçu une invitation sur ${APP_NAME}. Si vous ne vous y attendiez pas, vous pouvez l'ignorer.`,
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
      subject: `Join ${bandName} on ${APP_NAME}`,
      heading: `${inviterName} invites you to join ${bandName}`,
      paragraphs: [
        `${inviterName} invites you to join ${bandName} on ${APP_NAME}, the app where your band shares its repertoire, setlists and gigs.`,
        "This invitation is valid for 48 hours.",
      ],
      action: { label: "Join the band", url },
      footer: `You received this email because ${to} was invited to ${APP_NAME}. If you weren't expecting it, you can ignore it.`,
    },
    fr: {
      subject: `Rejoignez ${bandName} sur ${APP_NAME}`,
      heading: `${inviterName} vous invite à rejoindre ${bandName}`,
      paragraphs: [
        `${inviterName} vous invite à rejoindre ${bandName} sur ${APP_NAME}, l'application où votre groupe partage son répertoire, ses setlists et ses concerts.`,
        "Cette invitation est valable 48 heures.",
      ],
      action: { label: "Rejoindre le groupe", url },
      footer: `Vous recevez cet e-mail car ${to} a reçu une invitation sur ${APP_NAME}. Si vous ne vous y attendiez pas, vous pouvez l'ignorer.`,
    },
  };
  return build(to, language, content[language]);
}

/** "Forgot password?" on the login page (#24): the link opens the reset form. */
export function passwordResetEmail(to: string, language: Language, { url }: { url: string }): Mail {
  const content: Record<Language, EmailContent> = {
    en: {
      subject: `Reset your ${APP_NAME} password`,
      heading: "Reset your password",
      paragraphs: [
        `Someone asked to reset the password of your ${APP_NAME} account. Choose a new one with the button below.`,
        "This link is valid for 1 hour and can only be used once.",
      ],
      action: { label: "Choose a new password", url },
      footer: `You received this email because a password reset was requested for ${to}. If it wasn't you, ignore it: your password stays the same.`,
    },
    fr: {
      subject: `Réinitialisez votre mot de passe ${APP_NAME}`,
      heading: "Réinitialisation du mot de passe",
      paragraphs: [
        `Une demande de réinitialisation du mot de passe de votre compte ${APP_NAME} a été faite. Choisissez-en un nouveau avec le bouton ci-dessous.`,
        "Ce lien est valable 1 heure et ne peut servir qu'une fois.",
      ],
      action: { label: "Choisir un nouveau mot de passe", url },
      footer: `Vous recevez cet e-mail car une réinitialisation du mot de passe a été demandée pour ${to}. Si vous n'en êtes pas à l'origine, ignorez-le : votre mot de passe ne change pas.`,
    },
  };
  return build(to, language, content[language]);
}

/** The subjects as the team reads them. */
const CONTACT_SUBJECT_NAMES: Record<ContactSubject, string> = {
  bug: "Bug report",
  feature: "Feature request",
  praise: "Praise",
  other: "Other",
};

/**
 * A user's message to the app's team (#234), from the contact form. In English only: written to
 * the team, not to a user (the one exception). Replies go to the user. The subject line comes
 * from the subject's code: nothing the user typed goes into a header.
 */
export function contactEmail(
  to: string,
  {
    subject,
    message,
    sender,
    context,
  }: {
    subject: ContactSubject;
    message: string;
    sender: { name: string; email: string };
    /** A bug report's: what the team needs to reproduce it. */
    context?: { version: string; page: string | null; browser: string | null; language: Language };
  },
): Mail {
  const name = CONTACT_SUBJECT_NAMES[subject];
  const content: EmailContent = {
    subject: `${APP_NAME}: ${name}`,
    heading: name,
    paragraphs: [
      `From ${sender.name} (${sender.email}):`,
      // One paragraph per line: the layout doesn't keep line breaks.
      ...message.split(/\r?\n/).filter((line) => line.trim() !== ""),
      ...(context
        ? [
            `Version: ${context.version}`,
            `Page: ${context.page ?? "unknown"}`,
            `Browser: ${context.browser ?? "unknown"}`,
            `Language: ${context.language}`,
          ]
        : []),
    ],
    footer: `Sent with ${APP_NAME}'s contact form. Reply to answer ${sender.name}.`,
  };
  return { ...build(to, "en", content), replyTo: sender.email };
}
