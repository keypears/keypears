import {
  VerifyEngagementKeyOwnershipRequestSchema,
  VerifyEngagementKeyOwnershipResponseSchema,
} from "@keypears/api-client";
import { base } from "./base.js";
import { getVaultByNameAndDomain } from "../db/models/vault.js";
import { getEngagementKeyByPubKey } from "../db/models/engagement-key.js";

/**
 * Parse an address in the format "name@domain"
 * @param address - The address to parse
 * @returns Object with name and domain, or null if invalid format
 */
function parseAddress(
  address: string,
): { name: string; domain: string } | null {
  const atIndex = address.indexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === address.length - 1) {
    return null;
  }
  const name = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  return { name, domain };
}

/**
 * Verify engagement key ownership - cross-domain identity verification
 *
 * This is a public endpoint (no auth required) that allows Bob's server to verify
 * that a given engagement public key actually belongs to alice@domain.
 *
 * Use case:
 * 1. Alice wants to message Bob
 * 2. Alice creates engagement key on her server (purpose="send", counterpartyAddress="bob@...")
 * 3. Alice calls Bob's server with her pubkey + signature
 * 4. Bob's server calls THIS endpoint on Alice's server to verify ownership
 *
 * The endpoint checks:
 * - The address maps to a valid vault
 * - The engagement pubkey exists for that vault
 * - The engagement key has purpose="send" (created by the owner for outgoing messages)
 *
 * Security notes:
 * - No PoW required: pubkeys are essentially random, can't enumerate
 * - Returns only boolean: doesn't leak information about non-existent keys
 * - Only validates "send" keys: prevents using "receive" keys for impersonation
 */
export const verifyEngagementKeyOwnershipProcedure = base
  .input(VerifyEngagementKeyOwnershipRequestSchema)
  .output(VerifyEngagementKeyOwnershipResponseSchema)
  .handler(async ({ input }) => {
    const { address, engagementPubKey } = input;

    // Parse address to get vault name and domain
    const parsed = parseAddress(address);
    if (!parsed) {
      // Invalid address format - return false (don't leak format info)
      return { valid: false };
    }

    // Look up vault by name and domain
    const vault = await getVaultByNameAndDomain(parsed.name, parsed.domain);
    if (!vault) {
      // Vault doesn't exist - return false
      return { valid: false };
    }

    // Look up engagement key by pubkey
    const engagementKey = await getEngagementKeyByPubKey(engagementPubKey);
    if (!engagementKey) {
      // Key doesn't exist - return false
      return { valid: false };
    }

    // Verify the key belongs to this vault
    if (engagementKey.vaultId !== vault.id) {
      // Key belongs to different vault - return false
      return { valid: false };
    }

    // Verify the key was created for sending (purpose="send")
    // Only "send" keys are created by the owner for outgoing messages
    // "receive" keys are created by others requesting to receive from this vault
    if (engagementKey.purpose !== "send") {
      // Key is not a "send" key - return false
      return { valid: false };
    }

    // All checks passed - the pubkey belongs to this address
    return { valid: true };
  });
