import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { RPCHandler } from "@orpc/server/fetch";
import { apiRouter } from "./server/api.router";
import { getAdminAddress, getApiDomain } from "./lib/config";
import { validateFederationAuthority } from "./lib/federation-authority";

const handler = createStartHandler(defaultStreamHandler);
const rpcHandler = new RPCHandler(apiRouter);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check for load balancers. This must not touch DB or auth.
    if (url.pathname === "/health") {
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    if (url.pathname === "/.well-known/keypears.json") {
      const json: Record<string, string> = {
        apiDomain: validateFederationAuthority(getApiDomain()),
      };
      const admin = getAdminAddress();
      if (admin) json.admin = admin;
      return Response.json(json);
    }

    if (url.pathname.startsWith("/api/")) {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/api",
      });
      if (matched) return response;
    }

    return handler(request);
  },
};
