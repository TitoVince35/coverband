// Installing the app (#166): iPhones never offer it (Share › Add to Home Screen), and Android's
// own prompt is easy to miss. The home page shows a card while the app isn't installed.

import { useSyncExternalStore } from "react";

/** Saved when the card is dismissed: it doesn't come back on this device. */
export const INSTALL_DISMISSED_KEY = "coverband-install-dismissed";

/** Chrome's install prompt (not in TypeScript's DOM types). */
type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** What the card offers: the browser's prompt, the iPhone steps, or nothing. */
export type InstallMode = "prompt" | "ios" | null;

export function installMode(state: {
  installed: boolean;
  dismissed: boolean;
  canPrompt: boolean;
  ios: boolean;
}): InstallMode {
  if (state.installed || state.dismissed) return null;
  if (state.canPrompt) return "prompt";
  return state.ios ? "ios" : null;
}

/** iPhone or iPad (iPadOS calls itself a Mac, with a touch screen), where Safari installs by hand. */
export function isIos(userAgent: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

function readDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

let dismissed = false;

/**
 * Listens for the browser's install prompt from the start: Chrome fires it once, early, maybe
 * before React renders. Called by main.tsx.
 */
export function listenForInstall() {
  dismissed = readDismissed();
  installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Our card offers it instead of the browser's mini bar.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

function snapshot(): InstallMode {
  return installMode({
    installed,
    dismissed,
    canPrompt: deferredPrompt !== null,
    ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
  });
}

/** What the install card should offer right now. */
export function useInstallMode() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => null,
  );
}

/** Opens the browser's install prompt; true when the user installed the app. */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return false;
  // A prompt can only be shown once.
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}

/** Hides the card on this device for good. */
export function dismissInstall() {
  dismissed = true;
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Private mode: hidden until the next visit.
  }
  notify();
}
