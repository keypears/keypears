import { describe, test, expect } from "vitest";
import { Pow5_64b } from "../src/pow5-64b-wgsl.js";
import * as Pow5_64b_Wasm from "../src/pow5-64b-wasm.js";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { blake3Hash } from "@webbuf/blake3";

const MAX_GRID_SIZE = 32768;

// Expected values from Rust tests
const EXPECTED_MATMUL_WORK_ALL_ZEROES =
  "b1fee00a999ab4d93dcd2f6ced975c4e8ee110e0a1d48cb094fec3c934d0ee3c";
const EXPECTED_MATMUL_WORK_ALL_ONES =
  "bd7757a8d445a1145609570118cfc7ca1c6531304cf3ad531c1364338702295f";
const EXPECTED_ELEMENTARY_ITERATION_ALL_ZEROES =
  "f473678f945d1d5a63f52a89fbd6a4f069f960265844776ca9ff8bf09572dca3";
const EXPECTED_ELEMENTARY_ITERATION_ALL_ONES =
  "b5906d01328e86064b2a4783d0fc5f512fb1f2f923b3a869575482c0904fba44";

describe("Pow5_64b tests", async () => {
  test("placeholder test", async () => {});

  test("debug: hash header (WGSL)", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(
        headerAllZeroes,
        targetAllZeroes,
        MAX_GRID_SIZE,
      );
      await pow5.init(true);
      const result = await pow5.debugHashHeader();

      // Verify against blake3Hash
      const hashHex = blake3Hash(headerAllZeroes.buf).toHex();
      expect(result.hash.toHex()).toBe(hashHex);
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(headerAllOnes, targetAllZeroes, MAX_GRID_SIZE);
      await pow5.init(true);
      const result = await pow5.debugHashHeader();

      // Verify against blake3Hash
      const hashHex = blake3Hash(headerAllOnes.buf).toHex();
      expect(result.hash.toHex()).toBe(hashHex);
    }
  });

  test("debug: double hash header (WGSL)", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(
        headerAllZeroes,
        targetAllZeroes,
        MAX_GRID_SIZE,
      );
      await pow5.init(true);
      const result = await pow5.debugDoubleHashHeader();

      // Verify against blake3Hash
      const hashHex = blake3Hash(blake3Hash(headerAllZeroes.buf).buf).toHex();
      expect(result.hash.toHex()).toBe(hashHex);
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(headerAllOnes, targetAllZeroes, MAX_GRID_SIZE);
      await pow5.init(true);
      const result = await pow5.debugDoubleHashHeader();

      // Verify against blake3Hash
      const hashHex = blake3Hash(blake3Hash(headerAllOnes.buf).buf).toHex();
      expect(result.hash.toHex()).toBe(hashHex);
    }
  });

  test("debug: matmul work (WGSL)", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(
        headerAllZeroes,
        targetAllZeroes,
        MAX_GRID_SIZE,
      );
      await pow5.init(true);
      const result = await pow5.debugMatmulWork();
      expect(result.hash.toHex()).toBe(EXPECTED_MATMUL_WORK_ALL_ZEROES);
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(headerAllOnes, targetAllZeroes, MAX_GRID_SIZE);
      await pow5.init(true);
      const result = await pow5.debugMatmulWork();
      expect(result.hash.toHex()).toBe(EXPECTED_MATMUL_WORK_ALL_ONES);
    }
  });

  test("debug: elementary iteration (WGSL)", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(
        headerAllZeroes,
        targetAllZeroes,
        MAX_GRID_SIZE,
      );
      await pow5.init(true);
      const result = await pow5.debugElementaryIteration();
      expect(result.hash.toHex()).toBe(
        EXPECTED_ELEMENTARY_ITERATION_ALL_ZEROES,
      );
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const targetAllZeroes = FixedBuf.fromBuf(
        32,
        WebBuf.fromHex("00".repeat(32)),
      );
      const pow5 = new Pow5_64b(headerAllOnes, targetAllZeroes, MAX_GRID_SIZE);
      await pow5.init(true);
      const result = await pow5.debugElementaryIteration();
      expect(result.hash.toHex()).toBe(EXPECTED_ELEMENTARY_ITERATION_ALL_ONES);
    }
  });

  test("WASM: matmul work matches WGSL", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const result = Pow5_64b_Wasm.matmulWork(headerAllZeroes);
      expect(result.toHex()).toBe(EXPECTED_MATMUL_WORK_ALL_ZEROES);
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const result = Pow5_64b_Wasm.matmulWork(headerAllOnes);
      expect(result.toHex()).toBe(EXPECTED_MATMUL_WORK_ALL_ONES);
    }
  });

  test("WASM: elementary iteration matches WGSL", async () => {
    {
      const headerAllZeroes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("00".repeat(64)),
      );
      const result = Pow5_64b_Wasm.elementaryIteration(headerAllZeroes);
      expect(result.toHex()).toBe(EXPECTED_ELEMENTARY_ITERATION_ALL_ZEROES);
    }

    {
      const headerAllOnes = FixedBuf.fromBuf(
        64,
        WebBuf.fromHex("11".repeat(64)),
      );
      const result = Pow5_64b_Wasm.elementaryIteration(headerAllOnes);
      expect(result.toHex()).toBe(EXPECTED_ELEMENTARY_ITERATION_ALL_ONES);
    }
  });

  test("WASM: insertNonce works correctly", async () => {
    const header = FixedBuf.fromBuf(64, WebBuf.fromHex("00".repeat(64)));
    const result = Pow5_64b_Wasm.insertNonce(header, 0x12345678);
    // Nonce should be in bytes 28-31 in big-endian
    expect(result.buf[28]).toBe(0x12);
    expect(result.buf[29]).toBe(0x34);
    expect(result.buf[30]).toBe(0x56);
    expect(result.buf[31]).toBe(0x78);
  });

  test("WASM: setNonce works correctly", async () => {
    const header = FixedBuf.fromBuf(64, WebBuf.fromHex("00".repeat(64)));
    const nonce = FixedBuf.fromBuf(32, WebBuf.fromHex("11".repeat(32)));
    const result = Pow5_64b_Wasm.setNonce(header, nonce);
    // First 32 bytes should be 0x11
    for (let i = 0; i < 32; i++) {
      expect(result.buf[i]).toBe(0x11);
    }
    // Last 32 bytes should still be 0
    for (let i = 32; i < 64; i++) {
      expect(result.buf[i]).toBe(0);
    }
  });
});
