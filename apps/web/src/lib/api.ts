import { createApiClient } from "@coverband/api/client";

// Same origin in production (the API serves the web app) and in development (Vite proxies /api).
export const api = createApiClient(window.location.origin);
