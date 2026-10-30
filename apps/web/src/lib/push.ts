import type { Language } from "@coverband/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { base64UrlBytes } from "@/lib/base64url";
import { ensureOk } from "@/lib/errors";
import { isIos } from "@/lib/install";
import { notificationsQuery } from "@/lib/notifications";

/**
 * Push notifications on this device (#261): `on` or `off`; `denied` (blocked in the browser's
 * settings); `install` (an iPhone's browser: only the app added to the Home Screen gets them);
 * `unsupported` (another browser without push, or no service worker: the dev server).
 */
export type PushState = "on" | "off" | "denied" | "install" | "unsupported";

/** The server's public VAPID key; null when push is off on the server. */
export const pushKeyQuery = queryOptions({
  queryKey: ["push-key"],
  // The server's setting: it only changes with a deploy.
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: async () => (await (await ensureOk(await api.push.key.$get())).json()).publicKey,
});

/** This device's state, read from the browser (no request). */
export const pushStateQuery = queryOptions({
  queryKey: ["push-state"],
  queryFn: pushState,
});

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function pushState(): Promise<PushState> {
  if (!pushSupported()) {
    const installed = (navigator as { standalone?: boolean }).standalone === true;
    return isIos(navigator.userAgent, navigator.maxTouchPoints) && !installed
      ? "install"
      : "unsupported";
  }
  // The dev server has no service worker; a built app's may still be registering.
  if (!import.meta.env.PROD) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

/** Thrown when the user refuses the browser's permission prompt. */
export class PushDeniedError extends Error {}

/**
 * Turns push notifications on for this device: the browser's permission prompt (it must follow a
 * tap), a subscription with the server's key, saved on the server with the app's language (the
 * pushes' own words, #262).
 */
export async function enablePush(publicKey: string, language: Language) {
  if ((await Notification.requestPermission()) !== "granted") throw new PushDeniedError();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlBytes(publicKey),
  });
  try {
    const json = subscription.toJSON();
    await ensureOk(
      await api.push.subscription.$put({
        json: {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
          language,
        },
      }),
    );
  } catch (error) {
    // Not saved: nothing would ever be sent to it.
    await subscription.unsubscribe();
    throw error;
  }
}

/** Turns push notifications off for this device, on the server first. */
export async function disablePush() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await ensureOk(
    await api.push.subscription.$delete({ json: { endpoint: subscription.endpoint } }),
  );
  await subscription.unsubscribe();
}

/**
 * Before logging out: this device stops receiving the user's notifications, so whoever logs in
 * next on it never gets them. Never blocks the logout.
 */
export async function forgetPushSubscription() {
  if (!pushSupported()) return;
  await disablePush().catch(() => {});
}

/**
 * A push arriving while the app is open, or a tap on one (the service worker's message): the
 * notifications are checked again at once, so a note from the team shows (#262).
 */
export function listenForPushes(queryClient: QueryClient) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === "push") {
      void queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey });
    }
  });
}
