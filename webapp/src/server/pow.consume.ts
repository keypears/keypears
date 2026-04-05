import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { db } from "~/db";
import { usedPow } from "~/db/schema";
import { eq, lt } from "drizzle-orm";
import { verifyPowSolution } from "./pow.server";

/**
 * Verify a PoW solution AND consume it (prevent replay).
 * This is the function that should be used for all PoW verification
 * that gates a real action (account creation, login, channel opening).
 */
export async function verifyAndConsumePow(
  solvedHeaderHex: string,
  targetHex: string,
  expiresAt: number,
  signatureHex: string,
): Promise<{ valid: boolean; message?: string }> {
  // 1. Verify the solution
  const result = verifyPowSolution(
    solvedHeaderHex,
    targetHex,
    expiresAt,
    signatureHex,
  );
  if (!result.valid) return result;

  // 2. Check for replay — hash the solved header as unique identifier
  const headerHash = blake3Hash(WebBuf.fromHex(solvedHeaderHex)).buf.toHex();

  const [existing] = await db
    .select()
    .from(usedPow)
    .where(eq(usedPow.solvedHeaderHash, headerHash))
    .limit(1);

  if (existing) {
    return { valid: false, message: "Proof of work already used" };
  }

  // 3. Store to prevent future replay
  try {
    await db.insert(usedPow).values({
      solvedHeaderHash: headerHash,
      solvedHeader: solvedHeaderHex,
      target: targetHex,
      expiresAt: new Date(expiresAt),
    });
  } catch {
    // Duplicate insert race condition — another request used it first
    return { valid: false, message: "Proof of work already used" };
  }

  // 4. Lazy cleanup — delete expired entries
  await db.delete(usedPow).where(lt(usedPow.expiresAt, new Date()));

  return { valid: true };
}
