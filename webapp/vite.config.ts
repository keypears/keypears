import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function gitSha(): string {
  if (process.env.KEYPEARS_BUILD_SHA) {
    return process.env.KEYPEARS_BUILD_SHA;
  }

  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    const status = execSync("git status --short", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return status ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  server: {
    port: 3001,
    allowedHosts: true,
  },
  define: {
    __KEYPEARS_BUILD__: JSON.stringify({
      sha: gitSha(),
      builtAt: new Date().toISOString(),
    }),
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitroV2Plugin({
      compatibilityDate: "2026-05-16",
      preset: "node-server",
      routeRules: {
        "/**": {
          headers: securityHeaders,
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
});
