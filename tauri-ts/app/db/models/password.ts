/**
 * PASSWORD MODEL - NEEDS REWRITE FOR SERVER SYNC
 *
 * This file needs to be completely rewritten to work with the new server-required
 * synchronization architecture. The old model assumed client-side ULID generation
 * and stored full JSON blobs. The new model requires:
 *
 * 1. Server generates all IDs and timestamps
 * 2. Double encryption (client encrypts secret, then encrypts entire blob for server)
 * 3. Order numbers for efficient polling
 * 4. Sync before any mutations
 *
 * This file is temporarily disabled to allow schema compilation.
 * It will be rewritten as part of Phase 4: Sync Logic implementation.
 */

import { db } from "../index";
import { TableSecretUpdate } from "../schema";

export interface SecretUpdateRow {
  id: string;
  vaultId: string;
  secretId: string;
  globalOrder: number;
  localOrder: number;
  name: string;
  type: "password" | "envvar" | "apikey" | "walletkey" | "passkey";
  deleted: boolean;
  encryptedBlob: string;
  createdAt: number;
}

// Placeholder functions - will be rewritten for server sync

export async function createSecretUpdate(): Promise<never> {
  throw new Error("createSecretUpdate needs to be rewritten for server sync");
}

export async function getSecretUpdates(): Promise<never> {
  throw new Error("getSecretUpdates needs to be rewritten for server sync");
}

export async function getCurrentSecrets(): Promise<never> {
  throw new Error("getCurrentSecrets needs to be rewritten for server sync");
}

export async function getSecretHistory(): Promise<never> {
  throw new Error("getSecretHistory needs to be rewritten for server sync");
}
