import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-server configuration for the Pact console.
 *
 * - Port 3000 is the sandbox preview entry point.
 * - `/v1/*` and `/health` are proxied to the API process, so the console and
 *   the Phase 05 read API share one origin. Same-origin avoids a second host
 *   allowlist and keeps the bearer session token on one site.
 * - No host is hardcoded: the platform supplies
 *   `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` (Vite >= 6.1 appends it to
 *   `server.allowedHosts`) because the preview hostname carries a rotating
 *   sandbox id.
 */
const apiTarget = process.env["PACT_API_INTERNAL_URL"] ?? "http://127.0.0.1:8000";

const proxy = {
  "/v1": { target: apiTarget, changeOrigin: true },
  "/health": { target: apiTarget, changeOrigin: true },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy,
    // A bind-mounted source tree can drop inotify events; poll while running
    // under the Base44 preview so edits still hot-reload.
    ...(process.env["BASE44_PREVIEW_MODE"] === "1"
      ? { watch: { usePolling: true, interval: 300 } }
      : {}),
  },
  preview: { host: true, port: 3000, strictPort: true, proxy },
});
