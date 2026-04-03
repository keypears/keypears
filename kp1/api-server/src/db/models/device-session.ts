import { generateId } from "@keypears/lib";
import { eq, and } from "drizzle-orm";
import { db } from "../index.js";
import { TableDeviceSession } from "../schema.js";
import type { SelectDeviceSession } from "../schema.js";

/**
 * Create or update a device session for a vault.
 * If a session already exists for this vault+device combination, update it.
 * Otherwise, create a new session.
 *
 * @returns Session data with isNewDevice flag
 */
export async function createOrUpdateDeviceSession(
  vaultId: string,
  deviceId: string,
  hashedSessionToken: string,
  expiresAt: number,
  clientDeviceDescription?: string,
): Promise<SelectDeviceSession & { isNewDevice: boolean }> {
  // Check if device session exists for this vault+device combo
  const existing = await db
    .select()
    .from(TableDeviceSession)
    .where(
      and(
        eq(TableDeviceSession.vaultId, vaultId),
        eq(TableDeviceSession.deviceId, deviceId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    // Update existing session
    await db
      .update(TableDeviceSession)
      .set({
        hashedSessionToken,
        expiresAt,
        lastActivityAt: new Date(),
        ...(clientDeviceDescription && { clientDeviceDescription }),
      })
      .where(eq(TableDeviceSession.id, existing[0].id));

    // Fetch updated record
    const updated = await db
      .select()
      .from(TableDeviceSession)
      .where(eq(TableDeviceSession.id, existing[0].id))
      .limit(1);

    return { ...updated[0]!, isNewDevice: false };
  } else {
    // Create new session
    const id = generateId();
    const now = new Date();
    await db.insert(TableDeviceSession).values({
      id,
      vaultId,
      deviceId,
      hashedSessionToken,
      expiresAt,
      clientDeviceDescription: clientDeviceDescription || null,
      serverDeviceName: null,
      lastActivityAt: now,
      createdAt: now,
    });

    // Fetch created record
    const created = await db
      .select()
      .from(TableDeviceSession)
      .where(eq(TableDeviceSession.id, id))
      .limit(1);

    return { ...created[0]!, isNewDevice: true };
  }
}

/**
 * Get a device session by its hashed session token.
 * Used for authentication on every API request.
 *
 * @param hashedSessionToken Blake3 hash of the raw session token (64-char hex)
 * @returns Session data or null if not found
 */
export async function getDeviceSessionByHashedToken(
  hashedSessionToken: string,
): Promise<SelectDeviceSession | null> {
  const result = await db
    .select()
    .from(TableDeviceSession)
    .where(eq(TableDeviceSession.hashedSessionToken, hashedSessionToken))
    .limit(1);

  return result[0] || null;
}

/**
 * Delete a device session by its hashed session token.
 * Used during logout to invalidate the session.
 *
 * @param hashedSessionToken Blake3 hash of the raw session token (64-char hex)
 */
export async function deleteDeviceSessionByHashedToken(
  hashedSessionToken: string,
): Promise<void> {
  await db
    .delete(TableDeviceSession)
    .where(eq(TableDeviceSession.hashedSessionToken, hashedSessionToken));
}

/**
 * Update the last activity timestamp for a session.
 * Called on every authenticated request to track session usage.
 *
 * @param id Session ID
 */
export async function updateDeviceSessionActivity(id: string): Promise<void> {
  await db
    .update(TableDeviceSession)
    .set({ lastActivityAt: new Date() })
    .where(eq(TableDeviceSession.id, id));
}

/**
 * Get all device sessions for a vault.
 * Future use: device management UI to show/revoke devices.
 *
 * @param vaultId Vault ID
 * @returns Array of device sessions
 */
export async function getDeviceSessionsByVaultId(
  vaultId: string,
): Promise<SelectDeviceSession[]> {
  return db
    .select()
    .from(TableDeviceSession)
    .where(eq(TableDeviceSession.vaultId, vaultId));
}
