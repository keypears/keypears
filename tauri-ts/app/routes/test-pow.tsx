import type { Route } from "./+types/test-pow";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Label } from "~app/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~app/components/ui/toggle-group";
import { useState, useRef, useEffect } from "react";
import { getOfficialDomains } from "@keypears/lib";
import {
  Cpu,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { usePowMiner } from "~app/lib/use-pow-miner";

type MiningMode = "prefer-wgsl" | "wasm-only";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Test PoW - KeyPears" }];
}

export default function TestPow() {
  // UI-specific state
  const [miningMode, setMiningMode] = useState<MiningMode>("prefer-wgsl");
  const [difficultyInput, setDifficultyInput] = useState<string>("4000000");
  const [domain, setDomain] = useState<string>(
    () => getOfficialDomains()[0] ?? "keypears.com",
  );
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);
  const domainContainerRef = useRef<HTMLDivElement>(null);

  const officialDomains = getOfficialDomains();

  // Use the mining hook
  const miner = usePowMiner({
    domain,
    difficulty: difficultyInput,
    preferWgsl: miningMode === "prefer-wgsl",
    verifyWithServer: true,
  });

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

  // Derive status text and whether we're busy
  const isBusy =
    miner.status === "fetching" ||
    miner.status === "mining" ||
    miner.status === "verifying";
  const isMining = miner.status === "mining";

  // Determine mining status text based on implementation
  const getMiningStatusText = () => {
    if (miner.status === "mining") {
      return miner.implementation === "WGSL"
        ? "Mining (WGSL/WebGPU)..."
        : "Mining (WASM/CPU)...";
    }
    return "";
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Test PoW</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Test the proof-of-work algorithm (pow5-64b)
            </p>
          </div>

          <div className="border-border bg-card rounded-lg border p-6">
            <div className="flex flex-col gap-6">
              {/* Status Display */}
              <div className="flex items-center gap-3">
                {miner.status === "idle" && (
                  <div className="bg-muted rounded-full p-2">
                    <Zap className="text-muted-foreground h-5 w-5" />
                  </div>
                )}
                {(miner.status === "fetching" ||
                  miner.status === "mining" ||
                  miner.status === "verifying") && (
                  <div className="bg-primary/10 rounded-full p-2">
                    <Loader2 className="text-primary h-5 w-5 animate-spin" />
                  </div>
                )}
                {miner.status === "success" && (
                  <div className="rounded-full bg-green-500/10 p-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                )}
                {(miner.status === "error" || miner.status === "cancelled") && (
                  <div className="rounded-full bg-red-500/10 p-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="font-semibold">
                    {miner.status === "idle" && "Ready to test"}
                    {miner.status === "fetching" && "Fetching challenge..."}
                    {miner.status === "mining" && getMiningStatusText()}
                    {miner.status === "verifying" && "Verifying with server..."}
                    {miner.status === "success" && "Success!"}
                    {miner.status === "error" && "Error"}
                    {miner.status === "cancelled" && "Cancelled"}
                  </h2>
                  {miner.webGpuAvailable !== null && (
                    <p className="text-muted-foreground flex items-center gap-1 text-sm">
                      {miner.webGpuAvailable ? (
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
              {miner.error && (
                <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
                  {miner.error}
                </div>
              )}

              {/* Challenge Info */}
              {miner.challengeInfo && (
                <div className="border-border border-t pt-4">
                  <h3 className="mb-2 text-sm font-medium">Challenge Info</h3>
                  <div className="text-muted-foreground space-y-1 font-mono text-xs">
                    <p>
                      <span className="text-foreground">Algorithm:</span>{" "}
                      {miner.challengeInfo.algorithm}
                    </p>
                    <p>
                      <span className="text-foreground">Difficulty:</span>{" "}
                      {miner.challengeInfo.difficulty}
                    </p>
                    <p className="break-all">
                      <span className="text-foreground">Target:</span>{" "}
                      {miner.challengeInfo.target.slice(0, 16)}...
                    </p>
                  </div>
                </div>
              )}

              {/* Mining Result */}
              {miner.result && (
                <div className="border-border border-t pt-4">
                  <h3 className="mb-2 text-sm font-medium">Mining Result</h3>
                  <div className="text-muted-foreground space-y-1 font-mono text-xs">
                    <p>
                      <span className="text-foreground">Implementation:</span>{" "}
                      {miner.result.implementation} / {miner.result.algorithm}
                    </p>
                    <p>
                      <span className="text-foreground">Time:</span>{" "}
                      {(miner.result.elapsedMs / 1000).toFixed(2)}s (
                      {miner.result.elapsedMs.toFixed(0)}ms)
                    </p>
                    <p>
                      <span className="text-foreground">Nonce:</span>{" "}
                      {miner.result.nonce}
                    </p>
                    <p>
                      <span className="text-foreground">Iterations:</span>{" "}
                      {miner.result.iterations}
                    </p>
                    <p className="break-all">
                      <span className="text-foreground">Hash:</span>{" "}
                      {miner.result.hash.slice(0, 32)}...
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
                    disabled={isBusy}
                  />
                  <div className="absolute top-1/2 right-1 -translate-y-1/2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      tabIndex={-1}
                      onClick={() =>
                        setIsDomainDropdownOpen(!isDomainDropdownOpen)
                      }
                      disabled={isBusy}
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
                  disabled={isBusy}
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
                  onClick={() => miner.start()}
                  disabled={isBusy}
                  className="flex-1"
                >
                  {miner.status === "idle" && "Start PoW Test"}
                  {miner.status === "fetching" && "Fetching..."}
                  {miner.status === "mining" && "Mining..."}
                  {miner.status === "verifying" && "Verifying..."}
                  {miner.status === "success" && "Run Again"}
                  {miner.status === "error" && "Try Again"}
                  {miner.status === "cancelled" && "Try Again"}
                </Button>
                {isMining && (
                  <Button onClick={miner.cancel} variant="destructive">
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
