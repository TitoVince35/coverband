import type { PushState } from "@/lib/push";

/** Saved when the home page's offer is dismissed (#353): it doesn't come back on this device. */
export const PUSH_OFFER_DISMISSED_KEY = "coverband-push-offer-dismissed";

/**
 * Whether the home page offers to turn notifications on (#353): in the installed app (the install
 * card comes first), only when one tap does it (blocked or unsupported: the account page explains),
 * until dismissed.
 */
export function showPushOffer(offer: {
  installed: boolean;
  dismissed: boolean;
  state: PushState | undefined;
}) {
  return offer.installed && !offer.dismissed && offer.state === "off";
}

export function pushOfferDismissed() {
  try {
    return localStorage.getItem(PUSH_OFFER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPushOffer() {
  try {
    localStorage.setItem(PUSH_OFFER_DISMISSED_KEY, "1");
  } catch {
    // Private mode: hidden until the next visit.
  }
}
