// Set at build time by vite.config.ts (`define`); absent when tests run the code without Vite.
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;

/** Version of the app, from the root package.json. */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Commit the app was built from, or "dev" outside the deploy workflow. */
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";
