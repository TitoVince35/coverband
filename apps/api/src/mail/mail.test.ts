import { describe, expect, test } from "bun:test";
import { escapeHtml, renderEmail } from "./layout";
import { createSmtpMailer } from "./mailer";
import { passwordResetEmail, testEmail } from "./templates";

describe("email layout", () => {
  const content = {
    subject: "Join <The Band>",
    heading: "Hello <script>alert(1)</script>",
    paragraphs: ['Rock & "Roll"'],
    action: { label: "Accept", url: "https://example.com/invite?a=1&b=2" },
    footer: "Footer",
  };

  test("escapes every value in the HTML", () => {
    const { html } = renderEmail("en", content);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Hello &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Rock &amp; &quot;Roll&quot;");
    expect(html).toContain('href="https://example.com/invite?a=1&amp;b=2"');
    expect(escapeHtml("'")).toBe("&#39;");
  });

  test("plain text keeps the content and the link, unescaped", () => {
    const { text } = renderEmail("en", content);
    expect(text).toContain("Hello <script>alert(1)</script>");
    expect(text).toContain("Accept: https://example.com/invite?a=1&b=2");
    expect(text.endsWith("--\nFooter")).toBe(true);
  });

  test("uses the email's language", () => {
    expect(renderEmail("fr", content).html).toContain('<html lang="fr">');
    expect(renderEmail("fr", content).html).toContain("Si le bouton ne fonctionne pas");
  });
});

describe("templates", () => {
  test("the test email exists in every language", () => {
    const en = testEmail("a@example.com", "en", "http://localhost:5173");
    const fr = testEmail("a@example.com", "fr", "http://localhost:5173");
    expect(en.to).toBe("a@example.com");
    expect(en.subject).toBe("CoverBand test email");
    expect(fr.subject).toBe("E-mail de test CoverBand");
    expect(fr.text).toContain("http://localhost:5173");
  });

  test("the password reset email carries the link and its lifetime in every language", () => {
    const url = "http://localhost:5173/api/auth/reset-password/abc?callbackURL=%2Freset-password";
    const en = passwordResetEmail("a@example.com", "en", { url });
    const fr = passwordResetEmail("a@example.com", "fr", { url });
    expect(en.text).toContain(url);
    expect(en.text).toContain("1 hour");
    expect(fr.subject).toBe("Réinitialisez votre mot de passe CoverBand");
    expect(fr.text).toContain("1 heure");
  });
});

// Integration test: sends through Mailpit (`bun run db:up`) and reads it back from Mailpit's API.
// Skipped when MAILPIT_URL is unset.
const mailpitUrl = process.env.MAILPIT_URL;

describe.skipIf(!mailpitUrl)("SMTP mailer", () => {
  test("delivers an email to Mailpit", async () => {
    const to = `smtp-${crypto.randomUUID().slice(0, 8)}@test.localhost`;
    const mailer = createSmtpMailer({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      from: "CoverBand <noreply@coverband.localhost>",
    });

    await mailer.send(testEmail(to, "fr", "http://localhost:5173"));

    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const found = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]?.Subject).toBe("E-mail de test CoverBand");
    await fetch(`${mailpitUrl}/api/v1/messages`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ IDs: found.messages.map((m) => m.ID) }),
    });
  });
});
