import type { Language } from "@coverband/shared";

/** Content of an email, independent of HTML: templates build this, the layout renders it. */
export type EmailContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  /** Main button, with the link repeated as text for clients that hide buttons. */
  action?: { label: string; url: string };
  /** Why the person received this email. */
  footer: string;
};

const fallbackLink: Record<Language, string> = {
  en: "If the button doesn't work, copy this link into your browser:",
  fr: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
};

const BRAND = "#007a55";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Renders the shared CoverBand layout as HTML (inline styles, table layout: what email clients
 * support) and plain text. Every value is escaped: names typed by users end up in emails.
 */
export function renderEmail(
  language: Language,
  content: EmailContent,
): { html: string; text: string } {
  const { heading, paragraphs, action, footer } = content;
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#27272a">${escapeHtml(text)}</p>`;

  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:8px;background:${BRAND}">
<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#71717a">${escapeHtml(fallbackLink[language])}<br><a href="${escapeHtml(action.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(action.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Noto Sans',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${BRAND}">CoverBand</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#18181b">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join("\n")}
${button}
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#a1a1aa">${escapeHtml(footer)}</p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const text = [
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    "--",
    footer,
  ].join("\n");

  return { html, text };
}
