/**
 * Blake3 hash procedure
 * Accepts base64-encoded data (max 10KB) and returns hex-encoded Blake3 hash
 */
export declare const blake3Procedure: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
    data: import("zod").ZodString;
}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
    hash: import("zod").ZodString;
}, import("zod/v4/core").$strip>, Record<never, never>, Record<never, never>>;
//# sourceMappingURL=blake3.d.ts.map