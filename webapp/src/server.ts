import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { RPCHandler } from "@orpc/server/fetch";
import { apiRouter } from "./server/api.router";
import { getApiDomain } from "./lib/config";

const handler = createStartHandler(defaultStreamHandler);
const rpcHandler = new RPCHandler(apiRouter);

const isDev = process.env.NODE_ENV !== "production";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
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

function addSecurityHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

const CLIENT_DIR = join(import.meta.dirname, "..", "client");

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check for load balancers. No DB, no SSR, no auth — just a
    // cheap 200 that proves the process is accepting requests.
    if (url.pathname === "/health") {
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    // Serve .well-known/keypears.json
    if (url.pathname === "/.well-known/keypears.json") {
      return addSecurityHeaders(Response.json({ apiDomain: getApiDomain() }));
    }

    // Handle /api/* via oRPC
    if (url.pathname.startsWith("/api/")) {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/api",
      });
      if (matched) return addSecurityHeaders(response);
    }

    // Serve static assets from dist/client
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/_build/")
    ) {
      const filePath = join(CLIENT_DIR, url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return addSecurityHeaders(new Response(file));
      }
    }

    // Serve public files (favicon, fonts, etc.)
    const publicPath = join(CLIENT_DIR, url.pathname);
    if (url.pathname !== "/" && existsSync(publicPath)) {
      const file = Bun.file(publicPath);
      if (await file.exists()) {
        return addSecurityHeaders(new Response(file));
      }
    }

    // SSR for everything else
    return addSecurityHeaders(await handler(request));
  },
};
