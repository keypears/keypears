/* eslint-disable no-undef */
// Note: fetch, AbortController, setTimeout, clearTimeout are globals in Node 18+

export interface ServerValidationResult {
  valid: boolean;
  version?: number;
  error?: string;
}

/**
 * Validates that a given base URL points to a valid KeyPears server
 * by checking the .well-known/keypears.json file.
 *
 * @param baseUrl - Base URL of the server (e.g., "https://keypears.com" or "http://localhost:4273")
 * @param options - Validation options
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @returns Validation result with version info or error message
 *
 * @example
 * ```typescript
 * const result = await validateKeypearsServer("https://keypears.com");
 * if (result.valid) {
 *   console.log(`Valid KeyPears server v${result.version}`);
 * } else {
 *   console.error(`Invalid server: ${result.error}`);
 * }
 * ```
 */
export async function validateKeypearsServer(
  baseUrl: string,
  options: { timeout?: number } = {},
): Promise<ServerValidationResult> {
  const timeout = options.timeout ?? 5000;
  const wellKnownUrl = `${baseUrl}/.well-known/keypears.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(wellKnownUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 404 = Not a KeyPears server (most common case)
      if (response.status === 404) {
        return {
          valid: false,
          error:
            "Not a valid KeyPears server (missing /.well-known/keypears.json)",
        };
      }

      // Server errors (500-level)
      if (response.status >= 500) {
        return {
          valid: false,
          error: `Server error (HTTP ${response.status})`,
        };
      }

      // Other HTTP errors
      return {
        valid: false,
        error: `Server returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { version?: unknown };

    if (typeof data.version !== "number" || data.version < 1) {
      const result: ServerValidationResult = {
        valid: false,
        error: `Incompatible version (found: ${data.version ?? "none"}, need: 1+)`,
      };
      if (typeof data.version === "number") {
        result.version = data.version;
      }
      return result;
    }

    return { valid: true, version: data.version };
  } catch (error) {
    clearTimeout(timeoutId);

    // Actual timeout (AbortError from controller.abort())
    if ((error as Error).name === "AbortError") {
      return {
        valid: false,
        error: "Not a valid KeyPears server (connection failed or blocked)",
      };
    }

    // Network errors (DNS failure, connection refused, etc.)
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch") || error.message.includes("Failed"))
    ) {
      return {
        valid: false,
        error: "Cannot connect to server",
      };
    }

    // Unknown errors
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
