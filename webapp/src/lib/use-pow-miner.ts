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

      setPhase("mining");
      setHashCount(0);
      setDifficulty(challenge.difficulty);
      setProgress(0);
      setTimeRemaining("");
      setResult(null);
      startTimeRef.current = performance.now();

      const { Pow5_64b_Wasm, hashMeetsTarget } = await import(
        "@keypears/pow5"
      );
      const { FixedBuf } = await import("@webbuf/fixedbuf");
      const { WebBuf } = await import("@webbuf/webbuf");

      const headerBuf = FixedBuf.fromHex(64, challenge.header);
      const targetBuf = FixedBuf.fromHex(32, challenge.target);

      let solvedHeaderHex: string | null = null;
      let nonce = 0;

      while (!solvedHeaderHex) {
        const nonceBuf = WebBuf.alloc(32);
        let remaining = BigInt(nonce);
        for (let i = 31; i >= 0; i--) {
          nonceBuf[i] = Number(remaining & 0xffn);
          remaining = remaining >> 8n;
        }
        const testHeader = FixedBuf.fromBuf(
          64,
          WebBuf.from([...nonceBuf, ...headerBuf.buf.slice(32)]),
        );
        const hash = Pow5_64b_Wasm.elementaryIteration(testHeader);

        if (hashMeetsTarget(hash, targetBuf)) {
          solvedHeaderHex = testHeader.buf.toHex();
        }

        nonce++;
        if (nonce % 1000 === 0) {
          const elapsed = (performance.now() - startTimeRef.current) / 1000;
          const hashRate = nonce / elapsed;
          const expectedRemaining =
            hashRate > 0 ? challenge.difficulty / hashRate : 0;
          setHashCount(nonce);
          setProgress((elapsed / (elapsed + expectedRemaining)) * 100);
          setTimeRemaining(formatTime(expectedRemaining));
          await new Promise((resolve) => setTimeout(resolve, 0));
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
