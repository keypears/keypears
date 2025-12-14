import type { Route } from "./+types/test-pow5";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";
import { useState } from "react";
import { createClientFromDomain } from "@keypears/api-server/client";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  Pow5_64b_Wgsl,
  Pow5_64b_Wasm,
  Pow5_217a_Wgsl,
  Pow5_217a_Wasm,
  hashMeetsTarget,
} from "@keypears/pow5";
import { Cpu, Zap, CheckCircle, XCircle, Loader2 } from "lucide-react";

type Status =
  | "idle"
  | "fetching"
  | "mining-wgsl"
  | "mining-wasm"
  | "verifying"
  | "success"
  | "error";

type Pow5Algorithm = "pow5-64b" | "pow5-217a";

interface MiningResult {
  implementation: "WGSL" | "WASM";
  algorithm: Pow5Algorithm;
  headerHex: string;
  solvedHeaderHex: string;
  hashHex: string;
  nonce: number;
  iterations: number;
}

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Test Pow5 - KeyPears" }];
}

export default function TestPow5() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [targetHex, setTargetHex] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<Pow5Algorithm | null>(null);
  const [result, setResult] = useState<MiningResult | null>(null);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);

  async function runPowTest() {
    setStatus("fetching");
    setError(null);
    setResult(null);
    setAlgorithm(null);

    try {
      // Check WebGPU availability
      const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
      setWebGpuAvailable(hasWebGpu);

      // Fetch challenge from server (hardcoded to dev domain for testing)
      const client = await createClientFromDomain("keypears.localhost");
      const challenge = await client.api.getPowChallenge({});

      setDifficulty(challenge.difficulty);
      setTargetHex(challenge.target);
      setAlgorithm(challenge.algorithm);

      const targetBuf = FixedBuf.fromHex(32, challenge.target);

      let solvedHeaderHex: string;
      let hashHex: string;
      let nonce = 0;
      let iterations = 0;
      let implementation: "WGSL" | "WASM";

      if (challenge.algorithm === "pow5-64b") {
        // pow5-64b algorithm
        const headerBuf = FixedBuf.fromHex(64, challenge.header);

        if (hasWebGpu) {
          setStatus("mining-wgsl");
          implementation = "WGSL";

          const pow5 = new Pow5_64b_Wgsl(headerBuf, targetBuf, 128);
          await pow5.init();

          let found = false;
          let currentHeader = headerBuf;
          let baseNonce = 0;

          while (!found) {
            const workResult = await pow5.work();
            iterations++;

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
              baseNonce += 128 * 256;
              currentHeader = Pow5_64b_Wasm.insertNonce(headerBuf, baseNonce);
              await pow5.setInput(currentHeader, targetBuf, 128);
            }
          }
        } else {
          setStatus("mining-wasm");
          implementation = "WASM";

          let found = false;
          nonce = 0;

          while (!found) {
            const testHeader = Pow5_64b_Wasm.insertNonce(headerBuf, nonce);
            const testHash = Pow5_64b_Wasm.elementaryIteration(testHeader);
            iterations++;

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
          }
        }
      } else {
        // pow5-217a algorithm
        const headerBuf = FixedBuf.fromHex(217, challenge.header);

        if (hasWebGpu) {
          setStatus("mining-wgsl");
          implementation = "WGSL";

          const pow5 = new Pow5_217a_Wgsl(headerBuf, targetBuf, 128);
          await pow5.init();

          let found = false;
          let currentHeader = headerBuf;
          let baseNonce = 0;

          while (!found) {
            const workResult = await pow5.work();
            iterations++;

            const isZeroHash = workResult.hash.buf.every((b) => b === 0);

            if (!isZeroHash && hashMeetsTarget(workResult.hash, targetBuf)) {
              nonce = workResult.nonce;
              hashHex = workResult.hash.buf.toHex();
              solvedHeaderHex = Pow5_217a_Wasm.insertNonce(
                currentHeader,
                nonce,
              ).buf.toHex();
              found = true;
            } else {
              baseNonce += 128 * 256;
              currentHeader = Pow5_217a_Wasm.insertNonce(headerBuf, baseNonce);
              await pow5.setInput(currentHeader, targetBuf, 128);
            }
          }
        } else {
          setStatus("mining-wasm");
          implementation = "WASM";

          let found = false;
          nonce = 0;

          while (!found) {
            const testHeader = Pow5_217a_Wasm.insertNonce(headerBuf, nonce);
            const testHash = Pow5_217a_Wasm.elementaryIteration(testHeader);
            iterations++;

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
          }
        }
      }

      setResult({
        implementation,
        algorithm: challenge.algorithm,
        headerHex: challenge.header,
        solvedHeaderHex: solvedHeaderHex!,
        hashHex: hashHex!,
        nonce,
        iterations,
      });

      // Verify with server
      setStatus("verifying");

      const verification = await client.api.verifyPowProof({
        algorithm: challenge.algorithm,
        originalHeader: challenge.header,
        solvedHeader: solvedHeaderHex!,
        hash: hashHex!,
      });

      if (verification.valid) {
        setStatus("success");
      } else {
        setStatus("error");
        setError(`Server rejected proof: ${verification.message}`);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Test Pow5</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Test the proof-of-work algorithm (pow5-64b or pow5-217a)
            </p>
          </div>

          <div className="border-border bg-card rounded-lg border p-6">
            <div className="flex flex-col gap-6">
              {/* Status Display */}
              <div className="flex items-center gap-3">
                {status === "idle" && (
                  <div className="bg-muted rounded-full p-2">
                    <Zap className="text-muted-foreground h-5 w-5" />
                  </div>
                )}
                {(status === "fetching" ||
                  status === "mining-wgsl" ||
                  status === "mining-wasm" ||
                  status === "verifying") && (
                  <div className="bg-primary/10 rounded-full p-2">
                    <Loader2 className="text-primary h-5 w-5 animate-spin" />
                  </div>
                )}
                {status === "success" && (
                  <div className="rounded-full bg-green-500/10 p-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                )}
                {status === "error" && (
                  <div className="rounded-full bg-red-500/10 p-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="font-semibold">
                    {status === "idle" && "Ready to test"}
                    {status === "fetching" && "Fetching challenge..."}
                    {status === "mining-wgsl" && "Mining (WGSL/WebGPU)..."}
                    {status === "mining-wasm" && "Mining (WASM/CPU)..."}
                    {status === "verifying" && "Verifying with server..."}
                    {status === "success" && "Success!"}
                    {status === "error" && "Error"}
                  </h2>
                  {webGpuAvailable !== null && (
                    <p className="text-muted-foreground flex items-center gap-1 text-sm">
                      {webGpuAvailable ? (
                        <>
                          <Zap className="h-3 w-3" /> WebGPU available
                        </>
                      ) : (
                        <>
                          <Cpu className="h-3 w-3" /> WebGPU not available, using
                          WASM
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              {/* Challenge Info */}
              {difficulty && (
                <div className="border-border border-t pt-4">
                  <h3 className="mb-2 text-sm font-medium">Challenge Info</h3>
                  <div className="text-muted-foreground space-y-1 font-mono text-xs">
                    <p>
                      <span className="text-foreground">Algorithm:</span>{" "}
                      {algorithm}
                    </p>
                    <p>
                      <span className="text-foreground">Difficulty:</span>{" "}
                      {difficulty}
                    </p>
                    <p className="break-all">
                      <span className="text-foreground">Target:</span>{" "}
                      {targetHex?.slice(0, 16)}...
                    </p>
                  </div>
                </div>
              )}

              {/* Mining Result */}
              {result && (
                <div className="border-border border-t pt-4">
                  <h3 className="mb-2 text-sm font-medium">Mining Result</h3>
                  <div className="text-muted-foreground space-y-1 font-mono text-xs">
                    <p>
                      <span className="text-foreground">Implementation:</span>{" "}
                      {result.implementation} / {result.algorithm}
                    </p>
                    <p>
                      <span className="text-foreground">Nonce:</span>{" "}
                      {result.nonce}
                    </p>
                    <p>
                      <span className="text-foreground">Iterations:</span>{" "}
                      {result.iterations}
                    </p>
                    <p className="break-all">
                      <span className="text-foreground">Hash:</span>{" "}
                      {result.hashHex.slice(0, 32)}...
                    </p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <Button
                onClick={runPowTest}
                disabled={
                  status === "fetching" ||
                  status === "mining-wgsl" ||
                  status === "mining-wasm" ||
                  status === "verifying"
                }
                className="w-full"
              >
                {status === "idle" && "Start PoW Test"}
                {status === "fetching" && "Fetching..."}
                {(status === "mining-wgsl" || status === "mining-wasm") &&
                  "Mining..."}
                {status === "verifying" && "Verifying..."}
                {status === "success" && "Run Again"}
                {status === "error" && "Try Again"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
