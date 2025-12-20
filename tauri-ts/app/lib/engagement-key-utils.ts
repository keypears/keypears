import { createClientFromDomain } from "@keypears/api-server/client";
import {
  privateKeyAdd,
  publicKeyCreate,
  FixedBuf,
} from "@keypears/lib";
import { getSessionToken, getVaultKey } from "./vault-store";

/**
 * Derive the full engagement private key from an engagement key ID
 *
 * This function implements the key derivation protocol:
 * 1. Fetch the derivation private key from the server
 * 2. Add it to the vault private key using EC addition
 * 3. Optionally verify by computing the public key
 *
 * The derivation uses elliptic curve addition:
 *   engagementPrivKey = vaultPrivKey + derivationPrivKey (mod curve order)
 *
 * @param vaultId - The vault ID
 * @param vaultDomain - The vault's domain (e.g., "keypears.com")
 * @param engagementKeyId - The engagement key ID to derive
 * @param expectedPubKey - Optional: verify the derived key matches this public key
 * @returns The derived 32-byte engagement private key
 * @throws Error if no session token, derivation fails, or verification fails
 */
export async function deriveEngagementPrivKey(
  vaultId: string,
  vaultDomain: string,
  engagementKeyId: string,
  expectedPubKey?: string,
): Promise<FixedBuf<32>> {
  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Error("No session token available");
  }

  const client = await createClientFromDomain(vaultDomain, { sessionToken });

  // Get derivation private key from server
  const response = await client.api.getDerivationPrivKey({
    engagementKeyId,
  });

  // Get vault private key
  const vaultPrivKey = getVaultKey(vaultId);

  // Derive full private key: engagementPrivKey = vaultPrivKey + derivationPrivKey
  const derivationPrivKey = FixedBuf.fromHex(32, response.derivationPrivKey);
  const engagementPrivKey = privateKeyAdd(vaultPrivKey, derivationPrivKey);

  // Optionally verify the derived key matches expected public key
  if (expectedPubKey) {
    const computedPubKey = publicKeyCreate(engagementPrivKey);
    if (computedPubKey.toHex() !== expectedPubKey) {
      throw new Error("Engagement key verification failed - public key mismatch");
    }
  }

  return engagementPrivKey;
}

/**
 * Look up an engagement key by public key and derive its private key
 *
 * This is a convenience function that:
 * 1. Looks up the engagement key ID by public key hash
 * 2. Derives the private key from that engagement key
 *
 * @param vaultId - The vault ID
 * @param vaultDomain - The vault's domain
 * @param pubKey - The engagement public key (66-char hex)
 * @returns The derived 32-byte engagement private key
 */
export async function deriveEngagementPrivKeyByPubKey(
  vaultId: string,
  vaultDomain: string,
  pubKey: string,
): Promise<FixedBuf<32>> {
  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Error("No session token available");
  }

  const client = await createClientFromDomain(vaultDomain, { sessionToken });

  // Look up engagement key by public key
  const keyInfo = await client.api.getEngagementKeyByPubKey({
    vaultId,
    pubKey,
  });

  // Now derive the private key
  return deriveEngagementPrivKey(
    vaultId,
    vaultDomain,
    keyInfo.engagementKeyId,
    pubKey, // Verify against the pubkey we looked up
  );
}
