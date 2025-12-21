import { FixedBuf, privateKeyAdd, sign } from "@keypears/lib";
import { WebBuf } from "@webbuf/webbuf";
import { createClient } from "@keypears/api-client";

const TEST_SERVER_URL = "http://localhost:4273/api";

export interface TestEngagementKey {
  engagementKeyId: string;
  engagementPubKey: string; // 66-char hex
  engagementPrivKey: FixedBuf<32>;
}

/**
 * Creates a "send" engagement key for the given vault and counterparty.
 *
 * This involves:
 * 1. Calling getEngagementKeyForSending to create the key server-side
 * 2. Calling getDerivationPrivKey to get the derivation private key
 * 3. Computing engagementPrivKey = vaultPrivKey + derivationPrivKey
 */
export async function createSendEngagementKey(
  vaultId: string,
  vaultPrivKey: FixedBuf<32>,
  counterpartyAddress: string,
  sessionToken: string,
): Promise<TestEngagementKey> {
  const client = createClient({
    url: TEST_SERVER_URL,
    headers: { "x-vault-session-token": sessionToken },
  });

  // Create the engagement key
  const result = await client.api.getEngagementKeyForSending({
    vaultId,
    counterpartyAddress,
  });

  // Get derivation private key
  const derivResult = await client.api.getDerivationPrivKey({
    engagementKeyId: result.engagementKeyId,
  });

  // Compute engagement private key
  const derivationPrivKey = FixedBuf.fromHex(32, derivResult.derivationPrivKey);
  const engagementPrivKey = privateKeyAdd(vaultPrivKey, derivationPrivKey);

  return {
    engagementKeyId: result.engagementKeyId,
    engagementPubKey: result.engagementPubKey,
    engagementPrivKey,
  };
}

/**
 * Signs a PoW hash with an engagement private key.
 *
 * @param solvedHash - The hex-encoded solved hash from PoW
 * @param privKey - The 32-byte engagement private key
 * @returns Hex-encoded signature
 */
export function signPowHash(
  solvedHash: string,
  privKey: FixedBuf<32>,
): string {
  const messageHash = FixedBuf.fromHex(32, solvedHash);
  const nonce = FixedBuf.fromRandom(32); // ECDSA requires a random nonce
  const signature = sign(messageHash, privKey, nonce);
  return signature.buf.toHex();
}

/**
 * Creates an invalid signature (random bytes) for testing rejection.
 */
export function createInvalidSignature(): string {
  return FixedBuf.fromRandom(64).toHex();
}

/**
 * Creates a signature with the wrong key (different from claimed pubkey).
 */
export function signWithWrongKey(solvedHash: string): {
  signature: string;
  wrongPrivKey: FixedBuf<32>;
} {
  const wrongPrivKey = FixedBuf.fromRandom(32);
  const messageHash = FixedBuf.fromHex(32, solvedHash);
  const nonce = FixedBuf.fromRandom(32);
  const signature = sign(messageHash, wrongPrivKey, nonce);
  return {
    signature: signature.buf.toHex(),
    wrongPrivKey,
  };
}
