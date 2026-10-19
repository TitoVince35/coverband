// Sends a test email: `bun run mail:test you@example.com [fr]`.
// Locally it lands in Mailpit (http://localhost:8025).
import { isLanguage } from "@coverband/shared";
import { loadEnv, smtpConfig } from "../../env";
import { createSmtpMailer } from "./mailer";
import { testEmail } from "./templates";

const [to, language = "en"] = process.argv.slice(2);
if (!to || !isLanguage(language)) {
  console.error("Usage: bun run mail:test <email> [en|fr]");
  process.exit(1);
}

const env = loadEnv();
await createSmtpMailer(smtpConfig(env)).send(testEmail(to, language, env.BETTER_AUTH_URL));
console.log(`Test email sent to ${to} through ${env.SMTP_HOST}:${env.SMTP_PORT}`);
