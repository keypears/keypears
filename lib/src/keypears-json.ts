import { z } from "zod";

/**
 * Zod schema for the .well-known/keypears.json file
 *
 * This file is served by KeyPears servers to identify themselves and provide
 * configuration information to clients. The apiUrl field enables third-party
 * API hosting, similar to how email works (you can run your website at
 * example.com but have Gmail host your email).
 *
 * @example
 * ```json
 * {
 *   "version": 1,
 *   "apiUrl": "https://keypears.com/api"
 * }
 * ```
 */
export const KeypearsJsonSchema = z.object({
  /**
   * Protocol version number. Must be >= 1.
   * Used for future protocol upgrades and compatibility checks.
   */
  version: z
    .number()
    .int()
    .min(1, "Version must be at least 1"),

  /**
   * The full URL to the KeyPears API endpoint.
   * Must end with "/api" and be a valid URL.
   *
   * Examples:
   * - Production: "https://keypears.com/api"
   * - Development: "http://keypears.localhost:4273/api"
   * - Third-party hosting: "https://thirdparty.com/api"
   */
  apiUrl: z
    .string()
    .url("apiUrl must be a valid URL")
    .refine(
      (url) => url.endsWith("/api"),
      "apiUrl must end with '/api'",
    ),
});

/**
 * TypeScript type inferred from KeypearsJsonSchema
 */
export type KeypearsJson = z.infer<typeof KeypearsJsonSchema>;
