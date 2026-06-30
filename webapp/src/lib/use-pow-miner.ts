import { useState, useRef, useCallback } from "react";

export interface PowChallenge {
  header: string;
  target: string;
  expiresAt: number;
  difficulty: number;
  signature: string;
  senderAddress?: string;
  recipientAddress?: string;
}

export interface PowSolution {
  solvedHeader: string;
  target: string;
  expiresAt: number;
  signature: string;
  senderAddress?: string;
  recipientAddress?: string;
}

export type MinerPhase = "idle" | "mining" | "solved";

const HASHES_PER_GPU_BATCH = 256 * 128; // workgroupSize * gridSize = 32,768
const PROGRESS_CAP_WHILE_MINING = 95;
const MIN_BATCH_OVERRUN_LIMIT = 1000;
const EXPECTED_BATCH_OVERRUN_MULTIPLIER = 20;
const HASH_SAMPLE_LIMIT = 5;
const POW_LOG_PREFIX = "[keypears pow]";

function formatTime(seconds: number): string {
  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

interface PowDiagnostics {
  batchCount: number;
  hashCount: number;
  zeroResultBatches: number;
  nonZeroResultBatches: number;
  expectedBatches: number;
  overrunLimit: number;
  targetPrefix: string;
  difficulty: number;
  elapsedSeconds: number;
  hashRate: number;
  lastBatchMs: number;
  hashSamples: Array<{ nonce: number; hashPrefix: string }>;
}

function hexPrefix(hex: string): string {
  return `${hex.slice(0, 16)}...`;
}

function powError(message: string, data?: unknown): Error {
  return Object.assign(new Error(message), { powDiagnostics: data });
}

export function usePowMiner() {
  const [phase, setPhase] = useState<MinerPhase>("idle");
  const [hashCount, setHashCount] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PowSolution | null>(null);
  const startTimeRef = useRef(0);

  const mine = useCallback(
    async (
      challenge: PowChallenge,
      options?: { showSolved?: boolean },
    ): Promise<PowSolution> => {
      const showSolved = options?.showSolved ?? false;

      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        throw new Error(
          "WebGPU is required for proof of work. Please use a browser that supports WebGPU.",
        );
      }

      setPhase("mining");
      setHashCount(0);
      setDifficulty(challenge.difficulty);
      setProgress(0);
      setTimeRemaining("");
      setResult(null);
      startTimeRef.current = performance.now();

      try {
        const {
          Pow5_64b_Wasm,
          Pow5_64b_Wgsl,
          hashMeetsTarget,
          targetFromDifficulty,
        } = await import("@keypears/pow5");
        const { FixedBuf } = await import("@webbuf/fixedbuf");

        const headerBuf = FixedBuf.fromHex(64, challenge.header);
        const targetBuf = FixedBuf.fromHex(32, challenge.target);

        let solvedHeaderHex: string | null = null;
        let totalHashes = 0;

        const pow5 = new Pow5_64b_Wgsl(headerBuf, targetBuf, 128);
        await pow5.init(true);

        const gpuHeaderBlake3 = await pow5.debugHashHeader();
        const wasmMatmulWork = Pow5_64b_Wasm.matmulWork(headerBuf);
        const wasmHash = Pow5_64b_Wasm.elementaryIteration(headerBuf);
        const gpuMatmulWork = await pow5.debugMatmulWork();
        const gpuHash = await pow5.debugElementaryIteration();
        const gpuHeaderBlake3Hex = gpuHeaderBlake3.hash.buf.toHex();
        const wasmMatmulWorkHex = wasmMatmulWork.buf.toHex();
        const wasmHashHex = wasmHash.buf.toHex();
        const gpuMatmulWorkHex = gpuMatmulWork.hash.buf.toHex();
        const gpuHashHex = gpuHash.hash.buf.toHex();
        const selfCheckMatches = wasmHashHex === gpuHashHex;
        if (!selfCheckMatches) {
          throw powError("WASM/GPU self-check mismatch", {
            gpuHeaderBlake3: gpuHeaderBlake3Hex,
            wasmMatmulWork: wasmMatmulWorkHex,
            gpuMatmulWork: gpuMatmulWorkHex,
            matmulMatches: wasmMatmulWorkHex === gpuMatmulWorkHex,
            wasmHash: wasmHashHex,
            gpuHash: gpuHashHex,
          });
        }

        const easyTarget = targetFromDifficulty(1n);
        await pow5.setInput(headerBuf, easyTarget, 128);
        const smokeStart = performance.now();
        const smokeResult = await pow5.work();
        const smokeMs = performance.now() - smokeStart;
        const smokeHashHex = smokeResult.hash.buf.toHex();
        const smokeZero = smokeResult.hash.buf.every((b) => b === 0);
        const smokeMeetsTarget = hashMeetsTarget(smokeResult.hash, easyTarget);
        if (smokeZero || !smokeMeetsTarget) {
          throw powError("minimum-difficulty smoke test failed", {
            nonce: smokeResult.nonce,
            hash: smokeHashHex,
            zero: smokeZero,
            meetsTarget: smokeMeetsTarget,
            elapsedMs: Number(smokeMs.toFixed(3)),
          });
        }
        await pow5.setInput(headerBuf, targetBuf, 128);

        let currentHeader = headerBuf;
        let batchCount = 0;
        let zeroResultBatches = 0;
        let nonZeroResultBatches = 0;
        const hashSamples: PowDiagnostics["hashSamples"] = [];
        const expectedBatches = Math.max(
          1,
          Math.ceil(challenge.difficulty / HASHES_PER_GPU_BATCH),
        );
        const overrunLimit = Math.max(
          MIN_BATCH_OVERRUN_LIMIT,
          expectedBatches * EXPECTED_BATCH_OVERRUN_MULTIPLIER,
        );

        while (!solvedHeaderHex) {
          const batchStart = performance.now();
          const workResult = await pow5.work();
          const batchMs = performance.now() - batchStart;
          batchCount += 1;
          totalHashes += HASHES_PER_GPU_BATCH;

          const elapsed = (performance.now() - startTimeRef.current) / 1000;
          const hashRate = totalHashes / elapsed;
          const expectedRemaining =
            hashRate > 0 ? challenge.difficulty / hashRate : 0;
          setHashCount(totalHashes);
          setProgress(
            Math.min(
              PROGRESS_CAP_WHILE_MINING,
              (elapsed / (elapsed + expectedRemaining)) * 100,
            ),
          );
          setTimeRemaining(
            batchCount >= expectedBatches
              ? "searching past estimate"
              : formatTime(expectedRemaining),
          );

          const isZeroHash = workResult.hash.buf.every((b) => b === 0);
          const hashHex = workResult.hash.buf.toHex();
          if (isZeroHash) {
            zeroResultBatches += 1;
          } else {
            nonZeroResultBatches += 1;
            if (hashSamples.length < HASH_SAMPLE_LIMIT) {
              hashSamples.push({
                nonce: workResult.nonce,
                hashPrefix: hexPrefix(hashHex),
              });
            }
          }

          const diagnostics: PowDiagnostics = {
            batchCount,
            hashCount: totalHashes,
            zeroResultBatches,
            nonZeroResultBatches,
            expectedBatches,
            overrunLimit,
            targetPrefix: hexPrefix(challenge.target),
            difficulty: challenge.difficulty,
            elapsedSeconds: Number(elapsed.toFixed(3)),
            hashRate: Number(hashRate.toFixed(2)),
            lastBatchMs: Number(batchMs.toFixed(3)),
            hashSamples,
          };

          if (!isZeroHash && hashMeetsTarget(workResult.hash, targetBuf)) {
            solvedHeaderHex = Pow5_64b_Wasm.insertNonce(
              currentHeader,
              workResult.nonce,
            ).buf.toHex();
          } else if (batchCount >= overrunLimit) {
            throw powError(
              `Proof of work exceeded ${overrunLimit} batches without a solution.`,
              diagnostics,
            );
          } else {
            // Randomize nonce region for next batch
            const newBuf = currentHeader.buf.clone();
            const randomNonce = FixedBuf.fromRandom(32);
            newBuf.set(randomNonce.buf, 0);
            currentHeader = FixedBuf.fromBuf(64, newBuf);
            await pow5.setInput(currentHeader, targetBuf, 128);
          }
        }

        const solution: PowSolution = {
          solvedHeader: solvedHeaderHex,
          target: challenge.target,
          expiresAt: challenge.expiresAt,
          signature: challenge.signature,
          senderAddress: challenge.senderAddress,
          recipientAddress: challenge.recipientAddress,
        };

        setResult(solution);

        if (showSolved) {
          setPhase("solved");
          setProgress(100);
          // Don't auto-dismiss — the caller handles transition via onComplete
        } else {
          setPhase("idle");
        }

        return solution;
      } catch (err) {
        setPhase("idle");
        console.error(`${POW_LOG_PREFIX} mining failed`, err, {
          diagnostics:
            err instanceof Error
              ? (err as Error & { powDiagnostics?: unknown }).powDiagnostics
              : undefined,
        });
        throw err;
      }
    },
    [],
  );

  return {
    mine,
    phase,
    hashCount,
    difficulty,
    timeRemaining,
    progress,
    result,
  };
}
