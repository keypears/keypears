/**
 * KeyPears Node API Router
 * TypeScript implementation of the KeyPears API
 */
export declare const router: {
    blake3: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        data: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        hash: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, Record<never, never>, Record<never, never>>;
};
export type Router = typeof router;
export * from "./schemas.js";
//# sourceMappingURL=index.d.ts.map