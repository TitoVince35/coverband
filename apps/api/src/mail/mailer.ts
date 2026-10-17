import nodemailer from "nodemailer";

/** A rendered email, ready to send. */
export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type Mailer = {
  send(mail: Mail): Promise<void>;
};

export type SmtpConfig = {
  host: string;
  port: number;
  /** Implicit TLS (port 465); otherwise STARTTLS is used when the server offers it. */
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  /** Sender, e.g. `Coverband <noreply@example.com>`. */
  from: string;
};

/**
 * Sends over SMTP: Mailpit locally, Scaleway TEM in production. Switching provider is only
 * configuration (see briefs/claude/004_auth-review.md).
 */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: config.from, ...mail });
    },
  };
}

/** Keeps emails in memory instead of sending them, for tests. */
export function createMemoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
