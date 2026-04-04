import { useState, useRef, useCallback } from "react";

export interface PowChallenge {
  header: string;
  target: string;
  expiresAt: number;
  difficulty: number;
  signature: string;
}

export interface PowSolution {
  solvedHeader: string;
  target: string;
  expiresAt: number;
  signature: string;
}

export type MinerPhase = "idle" | "mining" | "solved";

const HASHES_PER_GPU_BATCH = 256 * 128; // workgroupSize * gridSize = 32,768

function formatTime(seconds: number): string {
  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
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

      const { Pow5_64b_Wasm, Pow5_64b_Wgsl, hashMeetsTarget } = await import(
        "@keypears/pow5"
      );
      const { FixedBuf } = await import("@webbuf/fixedbuf");

      const headerBuf = FixedBuf.fromHex(64, challenge.header);
      const targetBuf = FixedBuf.fromHex(32, challenge.target);

      let solvedHeaderHex: string | null = null;
      let totalHashes = 0;

      const pow5 = new Pow5_64b_Wgsl(headerBuf, targetBuf, 128);
      await pow5.init();

      let currentHeader = headerBuf;

      while (!solvedHeaderHex) {
        const workResult = await pow5.work();
        totalHashes += HASHES_PER_GPU_BATCH;

        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const hashRate = totalHashes / elapsed;
        const expectedRemaining =
          hashRate > 0 ? challenge.difficulty / hashRate : 0;
        setHashCount(totalHashes);
        setProgress((elapsed / (elapsed + expectedRemaining)) * 100);
        setTimeRemaining(formatTime(expectedRemaining));

        const isZeroHash = workResult.hash.buf.every((b) => b === 0);

        if (!isZeroHash && hashMeetsTarget(workResult.hash, targetBuf)) {
          solvedHeaderHex = Pow5_64b_Wasm.insertNonce(
            currentHeader,
            workResult.nonce,
          ).buf.toHex();
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
      };

      if (showSolved) {
        setPhase("solved");
        setProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setResult(solution);
      setPhase("idle");
      return solution;
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
