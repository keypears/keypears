import express from "express";
import type { Request, Response, NextFunction } from "express";
import { RPCHandler } from "@orpc/server/node";
import { CORSPlugin } from "@orpc/server/plugins";
import { router, initDerivationKeys } from "../src/index.js";

const PORT = 4275; // Different port to avoid conflict with webapp

// Initialize derivation keys from environment variables
// This must be called before the server starts handling requests
try {
  initDerivationKeys();
} catch (error) {
  console.error("Failed to initialize derivation keys:", error);
  process.exit(1);
}

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
    throw error;
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Test server listening on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
