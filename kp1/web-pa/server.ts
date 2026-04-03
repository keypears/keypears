import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import type { Request, Response, NextFunction } from "express";
// Importing router automatically loads derivation keys from environment variables
import { router } from "@keypears/api-server";
import { RPCHandler } from "@orpc/server/node";
import { onError } from "@orpc/server";

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "4283");

const app = express();

app.disable("x-powered-by");

// Enable CORS for all routes (required for Tauri app and federated architecture)
app.use(cors());

// Note: .well-known/keypears.json is now served by React Router route
// at web-pa/app/routes/[.]well-known.keypears[.]json.ts

// Mount oRPC API handler at /api BEFORE compression
const apiHandler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error("[oRPC Error]", error);
    }),
  ],
});

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await apiHandler.handle(req, res, {
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

// Compression for non-API routes
app.use(compression());

// Canonical URL redirect middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers.host;

  // Only redirect these specific non-canonical URLs
  const shouldRedirect =
    (protocol === "http" && host === "passapples.com") ||
    (protocol === "http" && host === "www.passapples.com") ||
    (protocol === "https" && host === "www.passapples.com");

  if (shouldRedirect) {
    const canonicalUrl = `https://passapples.com${req.originalUrl}`;
    return res.redirect(301, canonicalUrl);
  }

  next();
});

if (DEVELOPMENT) {
  console.log("Starting development server");
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: PORT + 1,
        },
      },
    }),
  );
  app.use(viteDevServer.middlewares);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  console.log("Starting production server");
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(morgan("tiny"));
  app.use(express.static("build/client", { maxAge: "1h" }));
  app.use(await import(BUILD_PATH).then((mod) => mod.app));
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
