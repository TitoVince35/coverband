import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Whether the device is online (TanStack Query's view, from the browser's online and offline
 * events). Offline, the app shows its saved data read-only (#165): every change is turned off.
 */
export function useOnline() {
  return useSyncExternalStore(
    onlineManager.subscribe.bind(onlineManager),
    () => onlineManager.isOnline(),
    () => true,
  );
}
