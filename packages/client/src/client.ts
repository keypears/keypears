import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "./contract";

export type KeypearsClient = ContractRouterClient<typeof contract>;

export function createKeypearsClient(apiDomain: string): KeypearsClient {
  const link = new RPCLink({ url: `https://${apiDomain}/api` });
  return createORPCClient(link);
}

export function createKeypearsClientFromUrl(apiUrl: string): KeypearsClient {
  const link = new RPCLink({ url: apiUrl });
  return createORPCClient(link);
}
