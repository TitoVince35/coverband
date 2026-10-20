import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@coverband/shared";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import rootPackage from "../../package.json" with { type: "json" };

export default defineConfig({
  // The running release, read through src/lib/build-info.ts. BUILD_SHA comes from the deploy
  // workflow's Docker build.
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __APP_BUILD__: JSON.stringify(process.env.BUILD_SHA || "dev"),
  },
  plugins: [
    // Must come before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // `%APP_NAME%` in index.html.
    { name: "app-name", transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME) },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: "Repertoire, setlists and gigs for your band",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Dark by default: splash screen and title bar match the dark theme.
        background_color: "#0c090c",
        theme_color: "#0c090c",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // API calls are never answered with the cached app shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // `bun run dev:lan` opens the dev server to the local network (phones); localhost only otherwise.
    host: process.env.DEV_LAN ? true : "localhost",
    // HTTPS with the local mkcert certificate, set by `bun run dev` / `dev:lan` when mkcert is
    // installed (apps/api/src/dev/tls.ts): service workers and the wake lock need it on a phone.
    ...(process.env.DEV_TLS_CERT_FILE &&
      process.env.DEV_TLS_KEY_FILE && {
        https: {
          cert: readFileSync(process.env.DEV_TLS_CERT_FILE),
          key: readFileSync(process.env.DEV_TLS_KEY_FILE),
        },
      }),
    // The API runs separately in development (`bun run dev:api`).
    // xfwd: the API sees the browser's IP in X-Forwarded-For (Better Auth's rate limits).
    proxy: { "/api": { target: "http://localhost:3000", xfwd: true } },
  },
});
