import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq } from "drizzle-orm";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { newId, hashToken } from "./utils";
import { parseAddress, apiUrlFromDomain, getApiDomain } from "~/lib/config";
import {
  federationWellKnownUrl,
  validateFederationAuthority,
  type FederationAuthority,
} from "~/lib/federation-authority";
import { safeFederationFetch } from "./fetch";
import { isLocalDomain } from "./user.server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { type KeypearsJson, type KeypearsClient } from "@keypears/client";
import { z } from "zod";

export type { KeypearsJson };

// --- keypears.json cache (1 minute TTL) ---

const CACHE_TTL_MS = 60_000;
const keypearsJsonCache = new Map<
  string,
  { data: KeypearsJson; fetchedAt: number }
>();

export async function fetchKeypearsJson(domain: string): Promise<KeypearsJson> {
  const authority = validateFederationAuthority(domain);
  const cached = keypearsJsonCache.get(authority);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await safeFederationFetch(
    federationWellKnownUrl(authority),
    undefined,
    { maxResponseBytes: 64_000 },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch keypears.json from ${domain}`);
  }
  const parsed = z
    .object({ apiDomain: z.string().optional(), admin: z.string().optional() })
    .parse(await response.json());
  const data: KeypearsJson = {
    ...parsed,
    apiDomain: parsed.apiDomain
      ? validateFederationAuthority(parsed.apiDomain)
      : undefined,
  };
  keypearsJsonCache.set(authority, { data, fetchedAt: Date.now() });
  return data;
}

async function resolveApiAuthority(
  domain: string,
): Promise<FederationAuthority> {
  if (await isLocalDomain(domain)) {
    return validateFederationAuthority(getApiDomain());
  }

  const json = await fetchKeypearsJson(domain);
  if (!json.apiDomain) {
    throw new Error(`Invalid keypears.json from ${domain}: missing apiDomain`);
  }
  return validateFederationAuthority(json.apiDomain);
}

export async function resolveApiUrl(domain: string): Promise<string> {
  return apiUrlFromDomain(await resolveApiAuthority(domain));
}

// --- oRPC client for remote servers ---

function createFederationClient(apiUrl: string): KeypearsClient {
  const link = new RPCLink({
    url: apiUrl,
    fetch: (request, init) =>
      safeFederationFetch(request, init, { maxResponseBytes: 1_000_000 }),
  });
  return createORPCClient(link) as unknown as KeypearsClient;
}

export async function getRemoteClient(
  domain: string,
): Promise<KeypearsClient> {
  const apiUrl = await resolveApiUrl(domain);
  return createFederationClient(apiUrl);
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
// A remote domain's server is the authoritative source for current public keys
// of addresses it hosts. This is the protocol trust boundary, not a
// transparency-backed key directory.

export async function fetchRemotePublicKey(
  address: string,
): Promise<{
  ed25519PublicKey: string;
  x25519PublicKey: string;
  signingPublicKey: string;
  encapPublicKey: string;
  keyNumber: number;
} | null> {
  const parsed = parseAddress(address);
  if (!parsed) return null;

  const client = await getRemoteClient(parsed.domain);
  const result = await client.getPublicKey({ address });
  if (!result.signingPublicKey || !result.encapPublicKey || !result.ed25519PublicKey || !result.x25519PublicKey || result.keyNumber == null) return null;
  return {
    ed25519PublicKey: result.ed25519PublicKey,
    x25519PublicKey: result.x25519PublicKey,
    signingPublicKey: result.signingPublicKey,
    encapPublicKey: result.encapPublicKey,
    keyNumber: result.keyNumber,
  };
}

export async function fetchRemotePowChallenge(input: {
  recipientAddress: string;
  senderAddress: string;
  senderEd25519PubKey: string;
  senderMldsaPubKey: string;
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
  encryptedContent: WebBuf,
  senderEncryptedContent: WebBuf,
  senderEd25519PubKey: WebBuf,
  senderX25519PubKey: WebBuf,
  senderMldsaPubKey: WebBuf,
  recipientX25519PubKey: WebBuf,
  recipientMlkemPubKey: WebBuf,
  senderSignature: WebBuf,
  recipientKeyNumber: number,
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
    senderEncryptedContent,
    senderEd25519PubKey,
    senderX25519PubKey,
    senderMldsaPubKey,
    recipientX25519PubKey,
    recipientMlkemPubKey,
    senderSignature,
    recipientKeyNumber,
    expiresAt,
  });

  // 2. Notify recipient's server with minimal fields
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
