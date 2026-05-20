import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function gitSha(): string {
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
  plugins: [tsConfigPaths(), tanstackStart(), react(), tailwindcss()],
});
