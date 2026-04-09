import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq } from "drizzle-orm";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { uuidv7 } from "uuidv7";

function newId(): string {
  return uuidv7();
}
import { parseAddress, apiUrlFromDomain, getApiDomain } from "~/lib/config";
import { isLocalDomain } from "./user.server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { apiRouter } from "./api.router";

type ApiClient = RouterClient<typeof apiRouter>;

// --- API domain discovery cache ---

const apiDomainCache = new Map<string, string>();

export async function resolveApiUrl(domain: string): Promise<string> {
  if (await isLocalDomain(domain)) return apiUrlFromDomain(getApiDomain());

  const cached = apiDomainCache.get(domain);
  if (cached) return apiUrlFromDomain(cached);

  const url = `https://${domain}/.well-known/keypears.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keypears.json from ${domain}`);
  }
  const json = (await response.json()) as { apiDomain: string };
  if (!json.apiDomain) {
    throw new Error(
      `Invalid keypears.json from ${domain}: missing apiDomain`,
    );
  }
  apiDomainCache.set(domain, json.apiDomain);
  return apiUrlFromDomain(json.apiDomain);
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
  return blake3Hash(WebBuf.fromUtf8(token)).buf.toHex();
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

export async function fetchRemotePowChallenge(recipientAddress: string) {
  const parsed = parseAddress(recipientAddress);
  if (!parsed) throw new Error("Invalid recipient address");
  const client = await getRemoteClient(parsed.domain);
  return client.getPowChallenge();
}

export async function deliverRemoteMessage(
  senderAddress: string,
  recipientAddress: string,
  encryptedContent: string,
  senderPubKey: string,
  recipientPubKey: string,
  pow: {
    solvedHeader: string;
    target: string;
    expiresAt: number;
    signature: string;
  },
): Promise<void> {
  const parsed = parseAddress(recipientAddress);
  if (!parsed) throw new Error("Invalid recipient address");

  // 1. Generate token and store pending delivery (recipient will pull from us)
  const token = generateToken();
  const tokenH = hashToken(token);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(pendingDeliveries).values({
    id: newId(),
    tokenHash: tokenH,
    senderAddress,
    recipientAddress,
    encryptedContent,
    senderPubKey,
    recipientPubKey,
    expiresAt,
  });

  // 2. Notify recipient's server, passing client-mined PoW if provided
  const client = await getRemoteClient(parsed.domain);
  try {
    await client.notifyMessage({
      senderAddress,
      recipientAddress,
      pullToken: token,
      pow,
    });
  } catch (err) {
    // Clean up pending delivery on failure
    await db
      .delete(pendingDeliveries)
      .where(eq(pendingDeliveries.tokenHash, tokenH));
    throw err;
  }
}
