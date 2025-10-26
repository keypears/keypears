import { WebBuf } from "@webbuf/webbuf";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyPearsClient } from "~src/client.js";

describe("KeyPearsClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("constructor", () => {
    it("should use empty string as default url", () => {
      const client = new KeyPearsClient();
      expect(client).toBeDefined();
    });

    it("should accept url in config", () => {
      const client = new KeyPearsClient({ url: "http://localhost:4274" });
      expect(client).toBeDefined();
    });

    it("should accept apiKey in config for future use", () => {
      const client = new KeyPearsClient({
        url: "http://localhost:4274",
        apiKey: "test-key",
      });
      expect(client).toBeDefined();
    });
  });

  describe("blake3", () => {
    it("should hash data correctly", async () => {
      const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
        }),
      });

      const client = new KeyPearsClient({ url: "http://localhost:4274" });
      const input = WebBuf.fromUtf8("hello world");
      const result = await client.blake3(input);

      expect(result.toHex()).toBe(
        "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
      );
    });

    it("should work with empty url (relative path)", async () => {
      const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
        }),
      });

      const client = new KeyPearsClient({ url: "" });
      const input = WebBuf.fromUtf8("hello world");
      await client.blake3(input);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/blake3",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should throw on HTTP error", async () => {
      const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const client = new KeyPearsClient({ url: "http://localhost:4274" });
      const input = new WebBuf([1, 2, 3]);

      await expect(client.blake3(input)).rejects.toThrow(
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

      const client = new KeyPearsClient({ url: "http://localhost:4274" });
      const input = new WebBuf([1, 2, 3]);

      await expect(client.blake3(input)).rejects.toThrow();
    });

    it("should convert input to base64 correctly", async () => {
      const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
        }),
      });

      const client = new KeyPearsClient({ url: "http://localhost:4274" });
      const input = WebBuf.fromUtf8("hello world");
      await client.blake3(input);

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
});
