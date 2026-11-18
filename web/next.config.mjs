import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Workspace commands run from web/, while the documented environment lives at the repo root.
if (process.env.PACT_LOAD_ENV !== "0") nextEnv.loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.env.NODE_ENV !== "production");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
