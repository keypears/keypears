import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq } from "drizzle-orm";
import { FixedBuf } from "@webbuf/fixedbuf";
import { newId, hashToken } from "./utils";
import { parseAddress, apiUrlFromDomain, getApiDomain } from "~/lib/config";
import { safeFetch } from "./fetch";
import { isLocalDomain } from "./user.server";
import {
  createKeypearsClientFromUrl,
  type KeypearsJson,
  type KeypearsClient,
} from "@keypears/client";

export type { KeypearsJson };

// --- keypears.json cache (1 minute TTL) ---

const CACHE_TTL_MS = 60_000;
const keypearsJsonCache = new Map<
  string,
  { data: KeypearsJson; fetchedAt: number }
>();

export async function fetchKeypearsJson(domain: string): Promise<KeypearsJson> {
  const cached = keypearsJsonCache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Use safeFetch for server-side (handles TLS, timeouts, etc.)
  const url = `https://${domain}/.well-known/keypears.json`;
  const response = await safeFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keypears.json from ${domain}`);
  }
  const { z } = await import("zod");
  const data = z
    .object({ apiDomain: z.string().optional(), admin: z.string().optional() })
    .parse(await response.json());
  keypearsJsonCache.set(domain, { data, fetchedAt: Date.now() });
  return data;
}

export async function resolveApiUrl(domain: string): Promise<string> {
  if (await isLocalDomain(domain)) return apiUrlFromDomain(getApiDomain());

  const json = await fetchKeypearsJson(domain);
  if (!json.apiDomain) {
    throw new Error(`Invalid keypears.json from ${domain}: missing apiDomain`);
  }
  return apiUrlFromDomain(json.apiDomain);
}

// --- oRPC client for remote servers ---

async function getRemoteClient(domain: string): Promise<KeypearsClient> {
  const apiUrl = await resolveApiUrl(domain);
  return createKeypearsClientFromUrl(apiUrl);
}

function generateToken(): string {
  return FixedBuf.fromRandom(32).buf.toHex();
}

// --- Domain verification ---

export async function verifyDomainAdmin(
  domainName: string,
  adminAddress: string,
): Promise<{ valid: boolean; message?: string }> {
  let json;
  try {
    json = await fetchKeypearsJson(domainName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, message: `Cannot reach ${domainName}: ${msg}` };
  }

  if (!json.apiDomain) {
    return { valid: false, message: "Missing apiDomain in keypears.json" };
  }
  if (json.apiDomain !== getApiDomain()) {
    return {
      valid: false,
      message: `apiDomain "${json.apiDomain}" does not match this server`,
    };
  }
  if (!json.admin) {
    return { valid: false, message: "Missing admin in keypears.json" };
  }
  if (json.admin !== adminAddress) {
    return {
      valid: false,
      message: `Admin "${json.admin}" does not match your address`,
    };
  }

  return { valid: true };
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

export async function fetchRemotePowChallenge(input: {
  recipientAddress: string;
  senderAddress: string;
  senderPubKey: string;
  signature: string;
  timestamp: number;
}) {
  const parsed = parseAddress(input.recipientAddress);
  if (!parsed) throw new Error("Invalid recipient address");
  const client = await getRemoteClient(parsed.domain);
  return client.getPowChallenge(input);
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
