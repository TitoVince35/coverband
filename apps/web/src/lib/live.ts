// Live mode (brief 031): a setlist read on stage, full screen, offline.
import { useEffect } from "react";

/**
 * Asks for real full screen where the browser has it (Android, desktops): only from a tap. An
 * iPhone has none for a page; the installed app already has no address bar.
 */
export function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
  root.requestFullscreen({ navigationUI: "hide" }).catch(() => {
    // Refused (no tap, or the browser says no): the page still covers the whole app.
  });
}

/** Leaves full screen when the live page closes, however it closes (exit button, back). */
export function useLeaveFullscreenOnClose() {
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
    [],
  );
}
