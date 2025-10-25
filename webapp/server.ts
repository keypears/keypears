import compression from "compression";
import express from "express";
import morgan from "morgan";
import type { Request, Response, NextFunction } from "express";

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "4273");

const app = express();

app.use(compression());
app.disable("x-powered-by");

// // Canonical URL redirect middleware (production only)
// if (!DEVELOPMENT) {
//   app.use((req: Request, res: Response, next: NextFunction) => {
//     const protocol = req.headers["x-forwarded-proto"] || req.protocol;
//     const host = req.headers.host;
//
//     // Canonical URL is https://keypears.com
//     const isCanonical = protocol === "https" && host === "keypears.com";
//
//     if (!isCanonical) {
//       const canonicalUrl = `https://keypears.com${req.originalUrl}`;
//       return res.redirect(301, canonicalUrl);
//     }
//
//     next();
//   });
// }

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

