import { os, ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { deriveHashedLoginKey } from "@keypears/lib";
import { getVaultById } from "../db/models/vault.js";
import type { IncomingHttpHeaders } from "node:http";

// Initial context with headers
const initialContextBase = os.$context<{
  headers: IncomingHttpHeaders;
}>();

// Execution context that extracts login key and session token from headers
const executionContextBase = initialContextBase.use(
  async ({ context, next }) => {
    // Extract login key from headers (if present)
    const loginKeyHeader = context.headers["x-vault-login-key"];
    const loginKey =
      typeof loginKeyHeader === "string" ? loginKeyHeader : undefined;

    // Extract session token from headers (if present)
    const sessionTokenHeader = context.headers["x-vault-session-token"];
    const sessionToken =
      typeof sessionTokenHeader === "string" ? sessionTokenHeader : undefined;

    return next({
      context: {
        ...context,
        loginKey,
        sessionToken,
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

// Session-authenticated procedure - requires valid session token
export const sessionAuthedProcedure = base.use(async ({ context, next }) => {
  // Check that session token is present
  if (!context.sessionToken) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Missing X-Vault-Session-Token header",
    });
  }

  // Hash incoming session token to look up in database
  const { blake3Hash } = await import("@webbuf/blake3");
  const { WebBuf } = await import("@webbuf/webbuf");

  // Validate session token is valid hex before processing
  let sessionTokenBuf;
  try {
    sessionTokenBuf = WebBuf.fromHex(context.sessionToken);
  } catch (err) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Invalid session token format",
    });
  }
  const hashedSessionToken = blake3Hash(sessionTokenBuf).buf.toHex();

  // Query device session by hashed token
  const { getDeviceSessionByHashedToken, updateDeviceSessionActivity, deleteDeviceSessionByHashedToken } = await import("../db/models/device-session.js");
  const session = await getDeviceSessionByHashedToken(hashedSessionToken);

  if (!session) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Invalid or expired session",
    });
  }

  // Check expiration
  if (Date.now() > session.expiresAt) {
    // Delete expired session
    await deleteDeviceSessionByHashedToken(hashedSessionToken);
    throw new ORPCError("UNAUTHORIZED", {
      message: "Session expired",
    });
  }

  // Update last activity (fire and forget - don't await)
  updateDeviceSessionActivity(session.id).catch((err) => {
    console.error("Failed to update session activity:", err);
  });

  // Pass session context to handler
  return next({
    context: {
      ...context,
      session,
      vaultId: session.vaultId,
      deviceId: session.deviceId,
    },
  });
});

/**
 * Validate that the provided login key is correct for the vault
 * Called from handlers after input is parsed
 *
 * Uses vault ID salting to prevent password reuse detection across vaults.
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

  // Derive hashed login key from provided login key with vault ID salting (100k rounds)
  const providedLoginKey = FixedBuf.fromHex(32, loginKeyHex);
  const derivedHashedLoginKey = deriveHashedLoginKey(providedLoginKey, vaultId);

  // Compare with stored hashed login key
  if (derivedHashedLoginKey.buf.toHex() !== vault.hashedLoginKey) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Invalid login key for vault",
    });
  }
}
