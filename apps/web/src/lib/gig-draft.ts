// A gig form's draft, kept while a setlist made from it is edited (#328): the form opens again with
// it, the new setlist chosen. Session storage: this tab only, gone with it.

const key = (gig: string) => `coverband-gig-draft:${gig}`;

/** Keeps a gig form's draft (`gig`: the gig's id, or "new"). */
export function keepGigDraft(gig: string, draft: unknown) {
  try {
    sessionStorage.setItem(key(gig), JSON.stringify(draft));
  } catch {
    // Storage refused (private mode, full): the form starts again from the gig.
  }
}

/** The gig form's kept draft, taken out of storage; null when there's none. */
export function takeGigDraft<T>(gig: string): T | null {
  try {
    const text = sessionStorage.getItem(key(gig));
    sessionStorage.removeItem(key(gig));
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
