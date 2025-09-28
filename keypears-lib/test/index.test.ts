import { describe, it, expect } from "vitest";
import { generateSecretFolderKey } from "../src/index";

describe("Index", () => {
  it("should generate a 32-byte secret folder key", () => {
    const key = generateSecretFolderKey();
    expect(key.buf.length).toBe(32);
  });
});
