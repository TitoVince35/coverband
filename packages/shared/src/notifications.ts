/**
 * Kinds of notifications (#260): the kind says how the app shows one. `admin-modal`: a note from
 * the app's team, sent from the admin app, shown in a modal closed only with "OK".
 */
export const NOTIFICATION_KINDS = ["admin-modal"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Who a notification says it comes from: `team`, "The Coverband team". */
export const NOTIFICATION_SENDERS = ["team"] as const;

export type NotificationSender = (typeof NOTIFICATION_SENDERS)[number];

/** A notification's text, in characters, once trimmed: plain text, line breaks kept. */
export const NOTIFICATION_TEXT_MAX_LENGTH = 5000;

/** A notification's text in parts: plain text, and the web addresses in it, shown as links. */
export type TextPart = { text: string } | { url: string };

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
/** Punctuation ending a sentence after an address, not part of it. */
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

/**
 * Splits a notification's text around its `http(s)://` addresses, so both apps show them as links
 * and everything else as typed (React escapes it). Punctuation right after an address stays text.
 */
export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ url });
    last = match.index + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
