import { pushCertificate } from "./push-certificate";

/**
 * A fake push service for the end-to-end tests (started by playwright.config.ts, #262): the
 * browser's subscriptions point here instead of Google's. Over HTTPS, as `web-push` only sends
 * there (the API trusts its certificate through NODE_EXTRA_CA_CERTS). It keeps what it receives:
 * `GET /received` lists it, without the encrypted payloads.
 */
type Received = { id: string; ttl: string | null; encoding: string | null; vapid: boolean };
const received: Received[] = [];
const { certFile, keyFile } = pushCertificate();

Bun.serve({
  port: Number(process.env.PORT),
  tls: { cert: Bun.file(certFile), key: Bun.file(keyFile) },
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/received") return Response.json(received);
    const id = /^\/push\/([\w-]+)$/.exec(url.pathname)?.[1];
    if (request.method !== "POST" || !id) return new Response("Not found", { status: 404 });
    await request.arrayBuffer();
    received.push({
      id,
      ttl: request.headers.get("ttl"),
      encoding: request.headers.get("content-encoding"),
      vapid: (request.headers.get("authorization") ?? "").startsWith("vapid "),
    });
    return new Response(null, { status: 201 });
  },
});
