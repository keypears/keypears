import { createClient } from "../src/client.js";
import { WebBuf } from "@webbuf/webbuf";

// Create client pointing to test server
const client = createClient({
  url: "http://localhost:4275/api",
});

async function testBlake3(): Promise<void> {
  console.log("Testing blake3 API...\n");

  try {
    // Test 1: Hash "hello"
    console.log("Test 1: Hash 'hello'");
    const helloData = WebBuf.fromUtf8("hello");
    const helloBase64 = helloData.toBase64();
    console.log(`  Input: "hello" (base64: ${helloBase64})`);

    const result = await client.blake3({ data: helloBase64 });
    console.log(`  Result: ${result.hash}`);
    console.log(`  Expected: ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f`);
    console.log(
      `  Match: ${result.hash === "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f" ? "✓" : "✗"}`,
    );
    console.log();

    // Test 2: Invalid base64
    console.log("Test 2: Invalid base64");
    try {
      await client.blake3({ data: "not-valid-base64!" });
      console.log("  ✗ Should have thrown an error");
    } catch (error) {
      console.log(`  ✓ Correctly threw error: ${error}`);
    }
    console.log();

    // Test 3: Data too large (>10KB)
    console.log("Test 3: Data too large (>10KB)");
    try {
      const largeData = WebBuf.fromBuf(new Uint8Array(11 * 1024)); // 11KB
      const largeBase64 = largeData.toBase64();
      await client.blake3({ data: largeBase64 });
      console.log("  ✗ Should have thrown an error");
    } catch (error) {
      console.log(`  ✓ Correctly threw error: ${error}`);
    }
    console.log();

    console.log("All tests completed!");
  } catch (error) {
    console.error("Error during testing:", error);
    process.exit(1);
  }
}

// Run tests
console.log("Make sure the test server is running: pnpm test:server\n");
testBlake3();
