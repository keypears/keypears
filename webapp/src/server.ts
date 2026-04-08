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

const CLIENT_DIR = join(import.meta.dirname, "..", "client");

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Serve .well-known/keypears.json
    if (url.pathname === "/.well-known/keypears.json") {
      return Response.json({
        apiDomain: getApiDomain(),
      });
    }

    // Handle /api/* via oRPC
    if (url.pathname.startsWith("/api/")) {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/api",
      });
      if (matched) return response;
    }

    // Serve static assets from dist/client
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/_build/")
    ) {
      const filePath = join(CLIENT_DIR, url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // Serve public files (favicon, fonts, etc.)
    const publicPath = join(CLIENT_DIR, url.pathname);
    if (url.pathname !== "/" && existsSync(publicPath)) {
      const file = Bun.file(publicPath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // SSR for everything else
    return handler(request);
  },
};
