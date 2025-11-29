import compression from "compression";
import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import type { Request, Response, NextFunction } from "express";
import { router } from "@keypears/api-server";
import { RPCHandler } from "@orpc/server/node";
import { CORSPlugin } from "@orpc/server/plugins";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "4273");

const app = express();

app.disable("x-powered-by");

// Serve .well-known directory BEFORE API handler
// Add CORS headers for Tauri app access
app.use("/.well-known", (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
}, express.static(path.join(__dirname, "public/.well-known")));

// Mount oRPC API handler at /api BEFORE compression
// Enable CORS for Tauri app (which makes cross-origin requests)
const apiHandler = new RPCHandler(router, {
  plugins: [new CORSPlugin()],
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
    (protocol === "http" && host === "keypears.com") ||
    (protocol === "http" && host === "www.keypears.com") ||
    (protocol === "https" && host === "www.keypears.com");

  if (shouldRedirect) {
    const canonicalUrl = `https://keypears.com${req.originalUrl}`;
    return res.redirect(301, canonicalUrl);
  }

  next();
});

if (DEVELOPMENT) {
  console.log("Starting development server");
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
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

