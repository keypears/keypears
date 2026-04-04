import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { parseAddress, getDomain, getApiUrl } from "~/lib/config";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { apiRouter } from "./api.router";

type ApiClient = RouterClient<typeof apiRouter>;

// --- API URL discovery cache ---

const apiUrlCache = new Map<string, string>();

async function resolveApiUrl(domain: string): Promise<string> {
  if (domain === getDomain()) return getApiUrl();

  const cached = apiUrlCache.get(domain);
  if (cached) return cached;

  const url = `https://${domain}/.well-known/keypears.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keypears.json from ${domain}`);
  }
  const json = (await response.json()) as { version: number; apiUrl: string };
  if (!json.apiUrl) {
    throw new Error(`Invalid keypears.json from ${domain}: missing apiUrl`);
  }
  apiUrlCache.set(domain, json.apiUrl);
  return json.apiUrl;
}

// --- oRPC client for remote servers ---

function createRemoteClient(apiUrl: string): ApiClient {
  const link = new RPCLink({ url: apiUrl });
  const client: ApiClient = createORPCClient(link);
  return client;
}

async function getRemoteClient(domain: string): Promise<ApiClient> {
  const apiUrl = await resolveApiUrl(domain);
  return createRemoteClient(apiUrl);
}

// --- Token utilities ---

function hashToken(token: string): string {
  return sha256Hash(WebBuf.fromUtf8(token)).buf.toHex();
}

function generateToken(): string {
  return FixedBuf.fromRandom(32).buf.toHex();
}

// --- Federation functions ---

export async function fetchRemotePublicKey(
  address: string,
): Promise<string | null> {
  const parsed = parseAddress(address);
  if (!parsed) return null;

  const client = await getRemoteClient(parsed.domain);
  const result = await client.getPublicKey({ address });
  return result.publicKey;
}

export async function deliverRemoteMessage(
  senderAddress: string,
  recipientAddress: string,
  encryptedContent: string,
  senderPubKey: string,
  recipientPubKey: string,
): Promise<void> {
  const parsed = parseAddress(recipientAddress);
  if (!parsed) throw new Error("Invalid recipient address");

  // 1. Generate token and store pending delivery
  const token = generateToken();
  const tokenH = hashToken(token);

  await db.insert(pendingDeliveries).values({
    tokenHash: tokenH,
    senderAddress,
    recipientAddress,
    encryptedContent,
    senderPubKey,
    recipientPubKey,
  });

  // 2. Build pull URL (our own API)
  const ourApiUrl = getApiUrl();

  // 3. Notify recipient's server via oRPC
  const client = await getRemoteClient(parsed.domain);
  try {
    await client.notifyMessage({
      senderAddress,
      recipientAddress,
      pullUrl: ourApiUrl,
      pullToken: token,
    });
  } catch (err) {
    console.error("Federation delivery failed:", err);
    // Clean up pending delivery on failure
    const { eq } = await import("drizzle-orm");
    await db
      .delete(pendingDeliveries)
      .where(eq(pendingDeliveries.tokenHash, tokenH));
    throw new Error("Failed to deliver message to remote server", {
      cause: err,
    });
  }
}
