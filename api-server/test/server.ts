import { createServer, type Server } from "node:http";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { RPCHandler } from "@orpc/server/node";
import { CORSPlugin } from "@orpc/server/plugins";
// Importing router automatically loads derivation keys from environment variables
import { router } from "../src/index.js";

const PORT = 4275; // Different port to avoid conflict with webapp

/**
 * Create and start the test server programmatically.
 * Returns a Promise that resolves to the http.Server instance.
 *
 * Used by vitest globalSetup to automatically start/stop the server for tests.
 */
export function createTestServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express();

    app.disable("x-powered-by");

    // oRPC handler (matching the working project pattern)
    const orpcHandler = new RPCHandler(router, {
      plugins: [new CORSPlugin()],
    });

    // Mount on /api route
    app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orpcHandler.handle(req, res, {
          prefix: "/api",
          context: { headers: req.headers },
        });
        if (!result.matched) {
          next(); // let other middlewares handle it
        }
      } catch (error) {
        console.error("oRPC handler error:", error);
        if (error instanceof Error) {
          console.error("Stack:", error.stack);
        }
        throw error;
      }
    });

    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: "Not found" });
    });

    // Create HTTP server
    const server = createServer(app);

    server.on("error", reject);
    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

// Run directly if executed as a script (for manual debugging)
// This allows `tsx test/server.ts` to still work
const currentFile = import.meta.url;
const isMainModule =
  process.argv[1] &&
  (currentFile === `file://${process.argv[1]}` ||
    currentFile === `file://${process.argv[1].replace(/\.ts$/, ".js")}`);

if (isMainModule) {
  createTestServer().then(() => {
    console.log(`Test server listening on http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}
