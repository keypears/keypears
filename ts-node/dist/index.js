import { blake3Procedure } from "./procedures/blake3.js";
/**
 * KeyPears Node API Router
 * TypeScript implementation of the KeyPears API
 */
export const router = {
    blake3: blake3Procedure,
};
// Re-export schemas for convenience
export * from "./schemas.js";
//# sourceMappingURL=index.js.map