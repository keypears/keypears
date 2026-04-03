import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { Router } from "~/rpc";

export type Client = RouterClient<Router>;

export function createClient(baseUrl: string): Client {
  return createORPCClient<Client>(new RPCLink({ url: `${baseUrl}/rpc` }));
}

export type { Router };
