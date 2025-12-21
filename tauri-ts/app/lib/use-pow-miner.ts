import { useState, useRef, useCallback } from "react";
import { createClientFromDomain } from "@keypears/api-server/client";
import { FixedBuf } from "@keypears/lib";
import { Pow5_64b_Wgsl, Pow5_64b_Wasm, hashMeetsTarget } from "@keypears/pow5";

// Constants for GPU hash computation
// GPU dispatches WORKGROUP_SIZE threads × gridSize workgroups per work() call
const GPU_WORKGROUP_SIZE = 256;
const GPU_GRID_SIZE = 128;
const HASHES_PER_GPU_ITERATION = GPU_WORKGROUP_SIZE * GPU_GRID_SIZE; // 32,768

// Helper to create a header with randomized nonce region (bytes 0-31)
// The GPU will overwrite bytes 28-31 with thread ID, but bytes 0-27 remain random
// This ensures each batch searches a different nonce space
function randomizeHeader64(header: FixedBuf<64>): FixedBuf<64> {
  const buf = header.buf.clone();
  const randomNonce = FixedBuf.fromRandom(32);
  buf.set(randomNonce.buf, 0);
  return FixedBuf.fromBuf(64, buf);
}

// PoW algorithm type (currently only pow5-64b, more may be added in the future)
export type PowAlgorithm = "pow5-64b";
export type PowImplementation = "WGSL" | "WASM";

export type PowMinerStatus =
  | "idle"
  | "fetching"
  | "mining"
  | "verifying"
  | "success"
  | "error"
  | "cancelled";

export interface PowMinerResult {
  challengeId: string;
  solvedHeader: string;
  hash: string;
  algorithm: PowAlgorithm;
  implementation: PowImplementation;
  nonce: number;
  iterations: number;
  elapsedMs: number;
}

export interface PowChallengeInfo {
  id: string;
  algorithm: PowAlgorithm;
  difficulty: number;
  target: string;
}

export interface UsePowMinerOptions {
  domain: string;
  difficulty: number;
  algorithm?: PowAlgorithm; // If not specified, server chooses
  preferWgsl?: boolean; // Default true
  verifyWithServer?: boolean; // Default false - whether to call verifyPowProof after mining
}

export interface PowMinerStartOptions {
  domain?: string;
  difficulty?: number;
  // Pre-fetched challenge data (if provided, skips fetching from server)
  challengeId?: string;
  header?: string;
  target?: string;
}

export interface UsePowMinerReturn {
  // State
  status: PowMinerStatus;
  implementation: PowImplementation | null;
  webGpuAvailable: boolean | null;
  iterations: number;
  hashesComputed: number;
  elapsedMs: number;
  result: PowMinerResult | null;
  error: string | null;
  challengeInfo: PowChallengeInfo | null;

  // Actions
  start: (overrides?: PowMinerStartOptions) => Promise<PowMinerResult | null>;
  cancel: () => void;
  reset: () => void;
}

export function usePowMiner(options: UsePowMinerOptions): UsePowMinerReturn {
  const {
    domain,
    difficulty,
    algorithm,
    preferWgsl = true,
    verifyWithServer = false,
  } = options;

  const [status, setStatus] = useState<PowMinerStatus>("idle");
  const [implementation, setImplementation] =
    useState<PowImplementation | null>(null);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
  const [iterations, setIterations] = useState(0);
  const [hashesComputed, setHashesComputed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<PowMinerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challengeInfo, setChallengeInfo] = useState<PowChallengeInfo | null>(
    null,
  );

  const cancelledRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const iterationsRef = useRef<number>(0);

  const reset = useCallback(() => {
    setStatus("idle");
    setImplementation(null);
    setIterations(0);
    setHashesComputed(0);
    setElapsedMs(0);
    setResult(null);
    setError(null);
    setChallengeInfo(null);
    cancelledRef.current = false;
    iterationsRef.current = 0;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus("cancelled");
    setError("Mining cancelled");
  }, []);

  const start = useCallback(
    async (
      overrides?: PowMinerStartOptions,
    ): Promise<PowMinerResult | null> => {
      const effectiveDomain = overrides?.domain ?? domain;
      const effectiveDifficulty = overrides?.difficulty ?? difficulty;

      cancelledRef.current = false;
      iterationsRef.current = 0;
      setStatus("fetching");
      setError(null);
      setResult(null);
      setChallengeInfo(null);
      setIterations(0);
      setHashesComputed(0);
      setElapsedMs(0);

      try {
        // Check WebGPU availability
        const browserHasWebGpu =
          typeof navigator !== "undefined" && "gpu" in navigator;
        setWebGpuAvailable(browserHasWebGpu);
        const useWgsl = preferWgsl && browserHasWebGpu;

        // Use pre-fetched challenge data if provided, otherwise fetch from server
        let challenge: {
          id: string;
          algorithm: string;
          difficulty: number;
          target: string;
          header: string;
        };

        if (
          overrides?.challengeId &&
          overrides?.header &&
          overrides?.target
        ) {
          // Use pre-fetched challenge
          challenge = {
            id: overrides.challengeId,
            algorithm: "pow5-64b",
            difficulty: effectiveDifficulty,
            target: overrides.target,
            header: overrides.header,
          };
        } else {
          // Fetch challenge from server
          const client = await createClientFromDomain(effectiveDomain);
          challenge = await client.api.getPowChallenge({
            difficulty: effectiveDifficulty,
          });
        }

        if (cancelledRef.current) return null;

        // If algorithm was specified and doesn't match, this is an error
        // (In practice, the server currently randomly selects, but we accept what it gives us)
        const challengeAlgorithm = challenge.algorithm as PowAlgorithm;

        setChallengeInfo({
          id: challenge.id,
          algorithm: challengeAlgorithm,
          difficulty: challenge.difficulty,
          target: challenge.target,
        });

        // Start timing
        startTimeRef.current = Date.now();

        const targetBuf = FixedBuf.fromHex(32, challenge.target);

        let solvedHeaderHex: string = "";
        let hashHex: string = "";
        let nonce = 0;

        // Set implementation based on WebGPU availability
        const impl: PowImplementation = useWgsl ? "WGSL" : "WASM";
        setImplementation(impl);
        setStatus("mining");

        // Currently only pow5-64b is supported (more algorithms may be added in the future)
        const headerBuf = FixedBuf.fromHex(64, challenge.header);

        if (useWgsl) {
          // WGSL/GPU mining for pow5-64b
          const pow5 = new Pow5_64b_Wgsl(headerBuf, targetBuf, 128);
          await pow5.init();

          let found = false;
          let currentHeader = headerBuf;

          while (!found && !cancelledRef.current) {
            const workResult = await pow5.work();
            iterationsRef.current++;
            setIterations(iterationsRef.current);
            setHashesComputed(iterationsRef.current * HASHES_PER_GPU_ITERATION);
            setElapsedMs(Date.now() - startTimeRef.current);

            const isZeroHash = workResult.hash.buf.every((b) => b === 0);

            if (!isZeroHash && hashMeetsTarget(workResult.hash, targetBuf)) {
              nonce = workResult.nonce;
              hashHex = workResult.hash.buf.toHex();
              solvedHeaderHex = Pow5_64b_Wasm.insertNonce(
                currentHeader,
                nonce,
              ).buf.toHex();
              found = true;
            } else {
              currentHeader = randomizeHeader64(headerBuf);
              await pow5.setInput(currentHeader, targetBuf, 128);
            }
          }
        } else {
          // WASM/CPU mining for pow5-64b
          let found = false;
          nonce = 0;

          while (!found && !cancelledRef.current) {
            const testHeader = Pow5_64b_Wasm.insertNonce(headerBuf, nonce);
            const testHash = Pow5_64b_Wasm.elementaryIteration(testHeader);
            iterationsRef.current++;

            if (hashMeetsTarget(testHash, targetBuf)) {
              solvedHeaderHex = testHeader.buf.toHex();
              hashHex = testHash.buf.toHex();
              found = true;
            } else {
              nonce++;
              if (nonce > 100_000_000) {
                throw new Error("Mining took too long (>100M iterations)");
              }
            }

            // Yield to UI every 10000 iterations for WASM
            if (iterationsRef.current % 10000 === 0) {
              setIterations(iterationsRef.current);
              setHashesComputed(iterationsRef.current); // CPU: 1 hash per iteration
              setElapsedMs(Date.now() - startTimeRef.current);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }

        if (cancelledRef.current) return null;

        // Final timing update
        const finalElapsedMs = Date.now() - startTimeRef.current;
        setIterations(iterationsRef.current);
        setElapsedMs(finalElapsedMs);

        const miningResult: PowMinerResult = {
          challengeId: challenge.id,
          solvedHeader: solvedHeaderHex,
          hash: hashHex,
          algorithm: challengeAlgorithm,
          implementation: impl,
          nonce,
          iterations: iterationsRef.current,
          elapsedMs: finalElapsedMs,
        };

        setResult(miningResult);

        // Optionally verify with server
        if (verifyWithServer) {
          setStatus("verifying");

          const verifyClient = await createClientFromDomain(effectiveDomain);
          const verification = await verifyClient.api.verifyPowProof({
            challengeId: challenge.id,
            solvedHeader: solvedHeaderHex,
            hash: hashHex,
          });

          if (verification.valid) {
            setStatus("success");
            return miningResult;
          } else {
            setStatus("error");
            setError(`Server rejected proof: ${verification.message}`);
            return null;
          }
        } else {
          setStatus("success");
          return miningResult;
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    },
    [domain, difficulty, algorithm, preferWgsl, verifyWithServer],
  );

  return {
    status,
    implementation,
    webGpuAvailable,
    iterations,
    hashesComputed,
    elapsedMs,
    result,
    error,
    challengeInfo,
    start,
    cancel,
    reset,
  };
}
