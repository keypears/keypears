import { useState, useRef, useCallback } from "react";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Pow5_64b_Wgsl, hashMeetsTarget } from "@keypears/pow5/wgsl";
import type { WebBuf } from "@webbuf/webbuf";

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

export type MinerPhase = "idle" | "mining" | "solved" | "error";

const HASHES_PER_GPU_BATCH = 256 * 128; // workgroupSize * gridSize = 32,768
const PROGRESS_CAP_WHILE_MINING = 95;
const MIN_BATCH_OVERRUN_LIMIT = 1_000;
const EXPECTED_BATCH_OVERRUN_MULTIPLIER = 20;
const HASH_SAMPLE_LIMIT = 5;

export interface PowMinerDiagnostics {
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
  hashSamples: Array<{ nonce: number; hashPrefix: string }>;
}

function formatTime(seconds: number): string {
  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

function insertNonce64b(header: WebBuf, nonce: number): WebBuf {
  const solvedHeader = header.clone();
  solvedHeader[28] = (nonce >>> 24) & 0xff;
  solvedHeader[29] = (nonce >>> 16) & 0xff;
  solvedHeader[30] = (nonce >>> 8) & 0xff;
  solvedHeader[31] = nonce & 0xff;
  return solvedHeader;
}

function createDiagnosticsError(diagnostics: PowMinerDiagnostics): Error {
  return new Error(
    `Proof of work exceeded ${diagnostics.overrunLimit} batches without a solution. ` +
      `Diagnostics: ${JSON.stringify(diagnostics)}`,
  );
}

export function usePowMiner() {
  const [phase, setPhase] = useState<MinerPhase>("idle");
  const [hashCount, setHashCount] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PowSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PowMinerDiagnostics | null>(
    null,
  );
  const startTimeRef = useRef(0);
  const diagnosticsRef = useRef<PowMinerDiagnostics | null>(null);

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
      setError(null);
      setDiagnostics(null);
      diagnosticsRef.current = null;
      startTimeRef.current = performance.now();

      try {
        const headerBuf = FixedBuf.fromHex(64, challenge.header);
        const targetBuf = FixedBuf.fromHex(32, challenge.target);

        let solvedHeaderHex: string | null = null;
        let batchCount = 0;
        let totalHashes = 0;
        let zeroResultBatches = 0;
        let nonZeroResultBatches = 0;
        const hashSamples: PowMinerDiagnostics["hashSamples"] = [];
        const expectedBatches = Math.max(
          1,
          Math.ceil(challenge.difficulty / HASHES_PER_GPU_BATCH),
        );
        const overrunLimit = Math.max(
          MIN_BATCH_OVERRUN_LIMIT,
          expectedBatches * EXPECTED_BATCH_OVERRUN_MULTIPLIER,
        );

        const pow5 = new Pow5_64b_Wgsl(headerBuf, targetBuf, 128);
        await pow5.init();

        let currentHeader = headerBuf;

        while (!solvedHeaderHex) {
          const workResult = await pow5.work();
          batchCount += 1;
          totalHashes += HASHES_PER_GPU_BATCH;

          const elapsed = (performance.now() - startTimeRef.current) / 1000;
          const hashRate = totalHashes / elapsed;
          const expectedRemaining =
            hashRate > 0 ? challenge.difficulty / hashRate : 0;
          const estimatedProgress = (batchCount / expectedBatches) * 100;
          setHashCount(totalHashes);
          setProgress(
            Math.min(PROGRESS_CAP_WHILE_MINING, estimatedProgress),
          );
          setTimeRemaining(
            batchCount >= expectedBatches
              ? "searching past estimate"
              : `${formatTime(expectedRemaining)} remaining`,
          );

          const isZeroHash = workResult.hash.buf.every((b) => b === 0);
          if (isZeroHash) {
            zeroResultBatches += 1;
          } else {
            nonZeroResultBatches += 1;
            if (hashSamples.length < HASH_SAMPLE_LIMIT) {
              hashSamples.push({
                nonce: workResult.nonce,
                hashPrefix: workResult.hash.toHex().slice(0, 16),
              });
            }
          }

          const nextDiagnostics: PowMinerDiagnostics = {
            batchCount,
            hashCount: totalHashes,
            zeroResultBatches,
            nonZeroResultBatches,
            expectedBatches,
            overrunLimit,
            targetPrefix: challenge.target.slice(0, 16),
            difficulty: challenge.difficulty,
            elapsedSeconds: Number(elapsed.toFixed(3)),
            hashRate: Number(hashRate.toFixed(2)),
            hashSamples,
          };
          diagnosticsRef.current = nextDiagnostics;
          setDiagnostics(nextDiagnostics);

          if (!isZeroHash && hashMeetsTarget(workResult.hash, targetBuf)) {
            solvedHeaderHex = FixedBuf.fromBuf(
              64,
              insertNonce64b(currentHeader.buf, workResult.nonce),
            ).toHex();
          } else if (batchCount >= overrunLimit) {
            throw createDiagnosticsError(nextDiagnostics);
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
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Proof of work failed to start.";
        setError(message);
        if (diagnosticsRef.current) {
          console.error("Proof of work diagnostics", diagnosticsRef.current);
        }
        setPhase("error");
        throw cause;
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
    error,
    diagnostics,
  };
}
