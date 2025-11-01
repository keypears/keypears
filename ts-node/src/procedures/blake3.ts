import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { ORPCError, os } from "@orpc/server";
import { Blake3RequestSchema, Blake3ResponseSchema } from "../schemas.js";

/**
 * Blake3 hash procedure
 * Accepts base64-encoded data (max 10KB) and returns hex-encoded Blake3 hash
 */
export const blake3Procedure = os
  .input(Blake3RequestSchema)
  .output(Blake3ResponseSchema)
  .handler(async ({ input }): Promise<{ hash: string }> => {
    // 1. Decode base64
    let data: WebBuf;
    try {
      data = WebBuf.fromBase64(input.data);
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Invalid base64 data",
      });
    }

    // 2. Check size limit (10KB)
    if (data.length > 10 * 1024) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Data too large: ${data.length} bytes (max 10KB)`,
      });
    }

    // 3. Hash with blake3
    const hash = blake3Hash(data);

    // 4. Return hex-encoded result
    return {
      hash: hash.buf.toHex(),
    };
  });
