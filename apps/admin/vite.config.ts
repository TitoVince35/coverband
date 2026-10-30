import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@coverband/shared";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The admin console (#246): desktop first, no service worker, served by the API on its own host.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // `%APP_NAME%` in index.html.
    { name: "app-name", transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME) },
  ],
  // One bundle for a desktop console, loaded once: no warning for its size.
  build: { chunkSizeWarningLimit: 1500 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // On its own host as in production: http(s)://admin.localhost:5174 (`bun run dev`).
    host: "localhost",
    port: 5174,
    strictPort: true,
    // HTTPS with the local mkcert certificate, as the web app's dev server (apps/api/src/dev/tls.ts).
    ...(process.env.DEV_TLS_CERT_FILE &&
      process.env.DEV_TLS_KEY_FILE && {
        https: {
          cert: readFileSync(process.env.DEV_TLS_CERT_FILE),
          key: readFileSync(process.env.DEV_TLS_KEY_FILE),
        },
      }),
    // The API keeps the browser's Host (the admin host): it serves the admin routes there.
    proxy: { "/api": { target: "http://localhost:3000", xfwd: true } },
  },
});
