import { WebBuf } from "@webbuf/webbuf";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { blake3Hash } from "~src/blake3.js";

describe("blake3Hash", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("should hash data correctly", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hash: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
      }),
    });

    const input = WebBuf.fromUtf8("hello world");
    const result = await blake3Hash(input, "http://localhost:4274");

    expect(result.toHex()).toBe(
      "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
    );
  });

  it("should throw on HTTP error", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    const input = new WebBuf([1, 2, 3]);
    await expect(blake3Hash(input, "http://localhost:4274")).rejects.toThrow(
      "HTTP error! status: 400",
    );
  });

  it("should throw on invalid response schema", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hash: "invalid-short-hash",
      }),
    });

    const input = new WebBuf([1, 2, 3]);
    await expect(blake3Hash(input, "http://localhost:4274")).rejects.toThrow();
  });

  it("should convert input to base64 correctly", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hash: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
      }),
    });

    const input = WebBuf.fromUtf8("hello world");
    await blake3Hash(input, "http://localhost:4274");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4274/api/blake3",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "aGVsbG8gd29ybGQ=" }),
      }),
    );
  });
});
