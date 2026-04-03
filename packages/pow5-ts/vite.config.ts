import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
import { stringPlugin } from "vite-string-plugin";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [
    stringPlugin({
      match: /\.(wgsl)$/i,
    }) as PluginOption,
  ],
  test: {
    name: "browser",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    exclude: ["test/**/*.node.ts"],
    include: ["test/**/*.browser.ts"],
  },
});
