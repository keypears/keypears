import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf, generateId, publicKeyCreate } from "@keypears/lib";
import { createClient } from "@keypears/api-client";
import { solvePowChallenge } from "./solve-pow.js";

const TEST_SERVER_URL = "http://localhost:4273/api";

export interface TestVaultCredentials {
  vaultId: string;
  name: string;
  domain: string;
  address: string; // e.g., "alice@keypears.com"
  vaultPrivKey: FixedBuf<32>;
  vaultPubKey: string; // 66-char hex
  loginKey: string;
  sessionToken: string;
}

export interface CreateTestVaultOptions {
  name: string;
  domain?: string; // defaults to "keypears.com"
  /** Optional seed for deterministic key generation (useful for tests) */
  seed?: string;
}

/**
 * Creates a test vault with all credentials needed for testing.
 *
 * Returns the vault ID, private key, public key, session token, and address.
 * The session token is already obtained by logging in.
 */
export async function createTestVault(
  options: CreateTestVaultOptions,
): Promise<TestVaultCredentials> {
  const { name, domain = "keypears.com", seed } = options;
  const address = `${name}@${domain}`;

  const client = createClient({ url: TEST_SERVER_URL });

  // Generate deterministic or random keys
  const vaultPrivKey = seed
    ? FixedBuf.fromBuf(32, sha256Hash(WebBuf.fromUtf8(seed)).buf)
    : FixedBuf.fromRandom(32);

  const vaultPubKey = publicKeyCreate(vaultPrivKey);
  const vaultPubKeyHash = sha256Hash(vaultPubKey.buf);

  // Generate login key
  const loginKeyBuf = sha256Hash(
    WebBuf.fromUtf8(`${seed || address}-login-key`),
  );
  const loginKey = loginKeyBuf.buf.toHex();

  // Generate encrypted vault key placeholder
  const encryptedVaultKey = sha256Hash(
    WebBuf.fromUtf8(`${seed || address}-encrypted-key`),
  );

  // Generate vault ID
  const vaultId = generateId();

  // Solve PoW and register vault
  const pow = await solvePowChallenge(TEST_SERVER_URL, { name });
  await client.api.registerVault({
    vaultId,
    name,
    domain,
    vaultPubKeyHash: vaultPubKeyHash.toHex(),
    vaultPubKey: vaultPubKey.toHex(),
    loginKey,
    encryptedVaultKey: encryptedVaultKey.buf.toHex(),
    ...pow,
  });

  // Login to get session token
  const deviceId = generateId();
  const loginResult = await client.api.login({
    vaultId,
    loginKey,
    deviceId,
    clientDeviceDescription: "Test device",
  });

  // Set low messaging difficulty for testing (MIN_USER_DIFFICULTY = 256)
  const authedClient = createClient({
    url: TEST_SERVER_URL,
    headers: { "x-vault-session-token": loginResult.sessionToken },
  });
  await authedClient.api.updateVaultSettings({
    vaultId,
    settings: {
      messagingMinDifficulty: 256, // Trivial difficulty for tests
    },
  });

  return {
    vaultId,
    name,
    domain,
    address,
    vaultPrivKey,
    vaultPubKey: vaultPubKey.toHex(),
    loginKey,
    sessionToken: loginResult.sessionToken,
  };
}
