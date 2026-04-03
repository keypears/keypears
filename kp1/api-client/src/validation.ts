import { KeypearsJsonSchema } from "@keypears/lib";
import { ZodError } from "zod";

/**
 * Result of fetching and parsing keypears.json
 */
export type KeypearsJsonResult =
  | {
      success: true;
      version: number;
      apiUrl: string;
    }
  | {
      success: false;
      error: string;
    };

export interface ServerValidationResult {
  valid: boolean;
  version?: number;
  apiUrl?: string;
  error?: string;
}

export interface FetchOptions {
  timeout?: number | undefined;
}

/**
 * Fetches and parses the .well-known/keypears.json file from a server.
 * This is the core function used by both createClientFromDomain() and validateKeypearsServer().
 *
 * @param baseUrl - Base URL of the server (e.g., "https://keypears.com")
 * @param options - Fetch options
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @returns Parsed keypears.json data or error
 */
export async function fetchKeypearsJson(
  baseUrl: string,
  options: FetchOptions = {},
): Promise<KeypearsJsonResult> {
  const timeout = options.timeout ?? 5000;
  const wellKnownUrl = `${baseUrl}/.well-known/keypears.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(wellKnownUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error:
            "Not a valid KeyPears server (missing /.well-known/keypears.json)",
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: `Server error (HTTP ${response.status})`,
        };
      }

      return {
        success: false,
        error: `Server returned HTTP ${response.status}`,
      };
    }

    const data: unknown = await response.json();
    const parsed = KeypearsJsonSchema.parse(data);

    return {
      success: true,
      version: parsed.version,
      apiUrl: parsed.apiUrl,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ZodError) {
      // ZodError always has at least one issue
      const message = error.issues[0]?.message ?? "validation failed";
      return {
        success: false,
        error: `Invalid keypears.json: ${message}`,
      };
    }

    if ((error as Error).name === "AbortError") {
      return {
        success: false,
        error: "Connection timed out",
      };
    }

    // Network errors (DNS failure, connection refused, etc.)
    // These show up as TypeError with messages like "Load failed" or "Failed to fetch"
    if (error instanceof TypeError) {
      return {
        success: false,
        error: "Cannot connect to server",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validates that a given base URL points to a valid KeyPears server
 * by checking the .well-known/keypears.json file.
 *
 * @param baseUrl - Base URL of the server (e.g., "https://keypears.com" or "http://localhost:4273")
 * @param options - Validation options
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @returns Validation result with version, apiUrl, or error message
 *
 * @example
 * ```typescript
 * const result = await validateKeypearsServer("https://keypears.com");
 * if (result.valid) {
 *   console.log(`Valid KeyPears server v${result.version}`);
 *   console.log(`API URL: ${result.apiUrl}`);
 * } else {
 *   console.error(`Invalid server: ${result.error}`);
 * }
 * ```
 */
export async function validateKeypearsServer(
  baseUrl: string,
  options: FetchOptions = {},
): Promise<ServerValidationResult> {
  const result = await fetchKeypearsJson(baseUrl, options);

  if (result.success) {
    return {
      valid: true,
      version: result.version,
      apiUrl: result.apiUrl,
    };
  }

  return {
    valid: false,
    error: result.error,
  };
}
