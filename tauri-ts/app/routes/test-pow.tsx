import type { Route } from "./+types/test-pow";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Label } from "~app/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~app/components/ui/toggle-group";
import { useState, useRef, useEffect } from "react";
import { createClientFromDomain } from "@keypears/api-server/client";
import { FixedBuf, getOfficialDomains } from "@keypears/lib";
import {
  Pow5_64b_Wgsl,
  Pow5_64b_Wasm,
  Pow5_217a_Wgsl,
  Pow5_217a_Wasm,
  hashMeetsTarget,
} from "@keypears/pow5";
import { Cpu, Zap, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";

// Helper to create a header with randomized nonce region (bytes 0-31)
// The GPU will overwrite bytes 28-31 with thread ID, but bytes 0-27 remain random
// This ensures each batch searches a different nonce space
function randomizeHeader64(header: FixedBuf<64>): FixedBuf<64> {
  const buf = header.buf.clone();
  const randomNonce = FixedBuf.fromRandom(32);
  buf.set(randomNonce.buf, 0);
  return FixedBuf.fromBuf(64, buf);
}

// Helper to create a header with randomized nonce region (bytes 117-148)
function randomizeHeader217(header: FixedBuf<217>): FixedBuf<217> {
  const buf = header.buf.clone();
  const randomNonce = FixedBuf.fromRandom(32);
  buf.set(randomNonce.buf, 117);
  return FixedBuf.fromBuf(217, buf);
}

type MiningMode = "prefer-wgsl" | "wasm-only";

type Status =
  | "idle"
  | "fetching"
  | "mining-wgsl"
  | "mining-wasm"
  | "verifying"
  | "success"
  | "error";

type PowAlgorithm = "pow5-64b" | "pow5-217a";

interface MiningResult {
  implementation: "WGSL" | "WASM";
  algorithm: PowAlgorithm;
  headerHex: string;
  solvedHeaderHex: string;
  hashHex: string;
  nonce: number;
  iterations: number;
  elapsedMs: number;
}

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Test PoW - KeyPears" }];
}

export default function TestPow() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [targetHex, setTargetHex] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<PowAlgorithm | null>(null);
  const [result, setResult] = useState<MiningResult | null>(null);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
  const [miningMode, setMiningMode] = useState<MiningMode>("prefer-wgsl");
  const [difficultyInput, setDifficultyInput] = useState<string>("4194304");
  const [domain, setDomain] = useState<string>(() => getOfficialDomains()[0] ?? "keypears.com");
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);
  const cancelledRef = useRef<boolean>(false);
  const domainContainerRef = useRef<HTMLDivElement>(null);

  const officialDomains = getOfficialDomains();

  // Handle click outside to close domain dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        domainContainerRef.current &&
        !domainContainerRef.current.contains(event.target as Node)
      ) {
        setIsDomainDropdownOpen(false);
      }
    };

    if (isDomainDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDomainDropdownOpen]);

  function cancelMining() {
    cancelledRef.current = true;
    setStatus("idle");
    setError("Mining cancelled");
  }

  async function runPowTest() {
    cancelledRef.current = false;
    setStatus("fetching");
    setError(null);
    setResult(null);
    setAlgorithm(null);

    try {
      // Check WebGPU availability (respecting mining mode toggle)
      const browserHasWebGpu =
        typeof navigator !== "undefined" && "gpu" in navigator;
      setWebGpuAvailable(browserHasWebGpu);
      const hasWebGpu = miningMode === "prefer-wgsl" && browserHasWebGpu;

      // Fetch challenge from server
      const client = await createClientFromDomain(domain);
      const challenge = await client.api.getPowChallenge({
        difficulty: difficultyInput,
      });

      // Start timing
      const startTime = Date.now();

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

          while (!found && !cancelledRef.current) {
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
              // Randomize the nonce region for the next batch
              // GPU will overwrite bytes 28-31 with thread ID, but bytes 0-27 remain random
              // This ensures each batch searches a different nonce space
              currentHeader = randomizeHeader64(headerBuf);
              await pow5.setInput(currentHeader, targetBuf, 128);
            }
          }

          if (cancelledRef.current) return;
        } else {
          setStatus("mining-wasm");
          implementation = "WASM";

          let found = false;
          nonce = 0;

          while (!found && !cancelledRef.current) {
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

            // Yield to UI every 10000 iterations for WASM
            if (iterations % 10000 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }

          if (cancelledRef.current) return;
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

          while (!found && !cancelledRef.current) {
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
              // Randomize the nonce region for the next batch
              // GPU will overwrite bytes 145-148 with thread ID, but bytes 117-144 remain random
              // This ensures each batch searches a different nonce space
              currentHeader = randomizeHeader217(headerBuf);
              await pow5.setInput(currentHeader, targetBuf, 128);
            }
          }

          if (cancelledRef.current) return;
        } else {
          setStatus("mining-wasm");
          implementation = "WASM";

          let found = false;
          nonce = 0;

          while (!found && !cancelledRef.current) {
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

            // Yield to UI every 10000 iterations for WASM
            if (iterations % 10000 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }

          if (cancelledRef.current) return;
        }
      }

      // Calculate elapsed time
      const elapsedMs = Date.now() - startTime;

      setResult({
        implementation,
        algorithm: challenge.algorithm,
        headerHex: challenge.header,
        solvedHeaderHex: solvedHeaderHex!,
        hashHex: hashHex!,
        nonce,
        iterations,
        elapsedMs,
      });

      // Verify with server
      setStatus("verifying");

      const verification = await client.api.verifyPowProof({
        challengeId: challenge.id,
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
            <h1 className="text-2xl font-bold">Test PoW</h1>
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
                          <Cpu className="h-3 w-3" /> WebGPU not available,
                          using WASM
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
                      <span className="text-foreground">Time:</span>{" "}
                      {(result.elapsedMs / 1000).toFixed(2)}s (
                      {result.elapsedMs.toFixed(0)}ms)
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

              {/* Server Domain */}
              <div className="border-border border-t pt-4">
                <Label
                  htmlFor="domain"
                  className="mb-2 block text-sm font-medium"
                >
                  Server Domain
                </Label>
                <div className="relative" ref={domainContainerRef}>
                  <Input
                    id="domain"
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onFocus={() => setIsDomainDropdownOpen(true)}
                    className="w-full pr-10 font-mono"
                    disabled={
                      status === "fetching" ||
                      status === "mining-wgsl" ||
                      status === "mining-wasm" ||
                      status === "verifying"
                    }
                  />
                  <div className="absolute top-1/2 right-1 -translate-y-1/2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      tabIndex={-1}
                      onClick={() => setIsDomainDropdownOpen(!isDomainDropdownOpen)}
                      disabled={
                        status === "fetching" ||
                        status === "mining-wgsl" ||
                        status === "mining-wasm" ||
                        status === "verifying"
                      }
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Domain Dropdown */}
                  {isDomainDropdownOpen && (
                    <div className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 w-full rounded-md border shadow-md">
                      <div className="p-1">
                        {officialDomains.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setDomain(d);
                              setIsDomainDropdownOpen(false);
                            }}
                            className="hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none"
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Difficulty Input */}
              <div className="border-border border-t pt-4">
                <Label
                  htmlFor="difficulty"
                  className="mb-2 block text-sm font-medium"
                >
                  Difficulty (min: 256)
                </Label>
                <Input
                  id="difficulty"
                  type="number"
                  min={256}
                  value={difficultyInput}
                  onChange={(e) => setDifficultyInput(e.target.value)}
                  className="w-full font-mono"
                  disabled={
                    status === "fetching" ||
                    status === "mining-wgsl" ||
                    status === "mining-wasm" ||
                    status === "verifying"
                  }
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Higher = more hashes required. 2^8 = 256, 2^20 ≈ 1M, 2^22 ≈ 4M
                </p>
              </div>

              {/* Mining Mode Toggle */}
              <div className="border-border border-t pt-4">
                <h3 className="mb-2 text-sm font-medium">Mining Mode</h3>
                <ToggleGroup
                  type="single"
                  value={miningMode}
                  onValueChange={(value) => {
                    if (value) setMiningMode(value as MiningMode);
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="prefer-wgsl" aria-label="Prefer WGSL">
                    <Zap className="mr-1 h-4 w-4" />
                    Prefer WGSL
                  </ToggleGroupItem>
                  <ToggleGroupItem value="wasm-only" aria-label="WASM Only">
                    <Cpu className="mr-1 h-4 w-4" />
                    WASM Only
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={runPowTest}
                  disabled={
                    status === "fetching" ||
                    status === "mining-wgsl" ||
                    status === "mining-wasm" ||
                    status === "verifying"
                  }
                  className="flex-1"
                >
                  {status === "idle" && "Start PoW Test"}
                  {status === "fetching" && "Fetching..."}
                  {(status === "mining-wgsl" || status === "mining-wasm") &&
                    "Mining..."}
                  {status === "verifying" && "Verifying..."}
                  {status === "success" && "Run Again"}
                  {status === "error" && "Try Again"}
                </Button>
                {(status === "mining-wgsl" || status === "mining-wasm") && (
                  <Button onClick={cancelMining} variant="destructive">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
