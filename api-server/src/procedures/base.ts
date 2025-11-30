import { os, ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { deriveHashedLoginKey } from "@keypears/lib";
import { getVaultById } from "../db/models/vault.js";
import type { IncomingHttpHeaders } from "node:http";

// Initial context with headers
const initialContextBase = os.$context<{
  headers: IncomingHttpHeaders;
}>();

// Execution context that extracts login key from headers
const executionContextBase = initialContextBase.use(
  async ({ context, next }) => {
    // Extract login key from headers (if present)
    const loginKeyHeader = context.headers["x-vault-login-key"];
    const loginKey =
      typeof loginKeyHeader === "string" ? loginKeyHeader : undefined;

    return next({
      context: {
        ...context,
        loginKey,
      },
    });
  },
);

// Base procedure without auth - for public endpoints like registerVault
export const base = executionContextBase;

// Vault-authenticated procedure - requires valid login key
export const vaultAuthedProcedure = base.use(async ({ context, next }) => {
  // Check that login key is present
  if (!context.loginKey) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Missing X-Vault-Login-Key header",
    });
  }

  // Pass through context with loginKey
  return next({
    context: {
      ...context,
      loginKey: context.loginKey,
    },
  });
});

/**
 * Validate that the provided login key is correct for the vault
 * Called from handlers after input is parsed
 */
export async function validateVaultAuth(
  loginKeyHex: string,
  vaultId: string,
): Promise<void> {
  // Query vault from database using model
  const vault = await getVaultById(vaultId);

  if (!vault) {
    throw new ORPCError("NOT_FOUND", {
      message: `Vault not found: ${vaultId}`,
    });
  }

  // Derive hashed login key from provided login key (1k rounds)
  const providedLoginKey = FixedBuf.fromHex(32, loginKeyHex);
  const derivedHashedLoginKey = deriveHashedLoginKey(providedLoginKey);

  // Compare with stored hashed login key
  if (derivedHashedLoginKey.buf.toHex() !== vault.hashedLoginKey) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Invalid login key for vault",
    });
  }
}
