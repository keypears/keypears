import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { safeRoutes } from "safe-routes/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const host = process.env.TAURI_DEV_HOST;
const port = parseInt(process.env.PORT || "1420", 10);

export default defineConfig(async () => ({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), safeRoutes()],

  // Pre-optimize all dependencies upfront to avoid 504 errors during navigation
  optimizeDeps: {
    entries: ["app/**/*.tsx", "app/**/*.ts"], // Scan all app code and optimize dependencies upfront
    force: true, // Always rebuild optimization cache on server start
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  // Port can be customized via PORT env var (e.g., PORT=1421 pnpm tauri:dev)
  server: {
    port,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: port + 1,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
