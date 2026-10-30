// Push notifications (#261), loaded by the service worker Workbox generates (vite.config.ts,
// `importScripts`). A push carries JSON: { title, body, url }.

self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : {};
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(message.title || "", {
        body: message.body,
        icon: "/pwa-192x192.png",
        data: { url: message.url || "/" },
      });
      // An open app checks its notifications again (`listenForPushes`, src/lib/push.ts).
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.postMessage({ type: "push" });
      }
    })(),
  );
});

// A tap on the notification: the app, at its page, in the window already open if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      open.postMessage({ type: "push" });
      if (open.url !== url) await open.navigate(url);
    })(),
  );
});
