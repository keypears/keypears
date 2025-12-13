import { defineConfig } from "vitest/config";
import { stringPlugin } from "vite-string-plugin";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [
    stringPlugin({
      match: /\.(wgsl)$/i,
    }),
  ],
  test: {
    name: "browser",
    environment: "happy-dom",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    exclude: ["test/**/*.node.ts"],
    include: ["test/**/*.browser.ts"],
  },
});
