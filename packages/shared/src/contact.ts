/** What a message to the app's team is about (#234): the code, never typed text, names it. */
export const CONTACT_SUBJECTS = ["bug", "feature", "praise", "other"] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** A contact message's length, in characters, once trimmed. */
export const CONTACT_MESSAGE = { min: 10, max: 5000 } as const;
