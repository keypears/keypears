import type { Server } from "node:http";

let server: Server | null = null;

/**
 * Vitest global setup - starts the test server before any tests run.
 * The server is shared across all test files and runs on port 4275.
 */
export async function setup() {
  // Load environment variables (same as test:server script)
  const dotenvx = await import("@dotenvx/dotenvx");
  dotenvx.config({ path: ".env.development" });

  // Import and start the test server
  const { createTestServer } = await import("./server.js");
  server = await createTestServer();

  console.log("Test server started on port 4275");
}

/**
 * Vitest global teardown - stops the test server after all tests complete.
 */
export async function teardown() {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log("Test server stopped");
  }
}
