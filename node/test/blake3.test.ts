import { describe, it, expect } from "vitest";
import { createClient } from "../src/client.js";
import { WebBuf } from "@webbuf/webbuf";

// Create client pointing to test server
// Note: Test server must be running on port 4275
const client = createClient({
  url: "http://localhost:4275/api",
});

describe("blake3 API", () => {
  it("should hash 'hello' correctly", async () => {
    const helloData = WebBuf.fromUtf8("hello");
    const helloBase64 = helloData.toBase64();

    const result = await client.blake3({ data: helloBase64 });

    expect(result.hash).toBe(
      "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f",
    );
    expect(result.hash).toHaveLength(64);
  });

  it("should return a 64-character hex hash", async () => {
    const data = WebBuf.fromUtf8("test data");
    const base64Data = data.toBase64();

    const result = await client.blake3({ data: base64Data });

    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should throw error for invalid base64", async () => {
    await expect(
      client.blake3({ data: "not-valid-base64!" }),
    ).rejects.toThrow();
  });

  it("should throw error for data larger than 10KB", async () => {
    const largeData = WebBuf.fromBuf(new Uint8Array(11 * 1024)); // 11KB
    const largeBase64 = largeData.toBase64();

    await expect(client.blake3({ data: largeBase64 })).rejects.toThrow();
  });

  it("should accept data up to 10KB", async () => {
    const maxData = WebBuf.fromBuf(new Uint8Array(10 * 1024)); // Exactly 10KB
    const maxBase64 = maxData.toBase64();

    const result = await client.blake3({ data: maxBase64 });

    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
