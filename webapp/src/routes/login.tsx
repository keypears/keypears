import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { login } from "~/server/user.functions";
import { getLoginPowChallenge } from "~/server/pow.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  cacheEncryptionKey,
  calculatePasswordEntropy,
  entropyTier,
  cacheEntropyTier,
} from "~/lib/auth";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function formatTime(seconds: number): string {
  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

function LoginPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "mining" | "logging-in">("idle");
  const [miningStatus, setMiningStatus] = useState("");
  const startTimeRef = useRef(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseKeypearAddress(address);
    if (id == null) {
      setError("Enter a valid KeyPears address (e.g. 1@keypears.com).");
      return;
    }

    setPhase("mining");
    try {
      // 1. Get login PoW challenge
      const challenge = await getLoginPowChallenge();
      startTimeRef.current = performance.now();

      // 2. Mine
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
          setMiningStatus(
            `Verifying... ${formatTime(expectedRemaining)} remaining`,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // 3. Derive keys and login
      setPhase("logging-in");
      const passwordKey = derivePasswordKey(password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      await login({
        data: {
          id,
          loginKey,
          solvedHeader: solvedHeaderHex,
          target: challenge.target,
          expiresAt: challenge.expiresAt,
          signature: challenge.signature,
        },
      });
      const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
      cacheEncryptionKey(encryptionKey);
      cacheEntropyTier(entropyTier(calculatePasswordEntropy(password)));
      navigate({ to: "/inbox" });
    } catch {
      setError("Invalid KeyPears address or password.");
      setPhase("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex justify-end px-6 py-4">
        <span className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <a
            href="/"
            className="text-accent hover:text-accent/80 no-underline"
          >
            Create one
          </a>
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img
              src={$icon("/images/keypears-64.webp")}
              alt="KeyPears"
              className="h-10 w-10"
            />
            <h1 className="text-foreground text-3xl font-bold">Log In</h1>
          </div>

          {phase === "idle" && (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 text-left"
            >
              <input
                type="text"
                placeholder="KeyPears address (e.g. 1@keypears.com)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                required
              />
              {error && <p className="text-danger text-sm">{error}</p>}
              <button
                type="submit"
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300"
              >
                Log In
              </button>
            </form>
          )}

          {phase === "mining" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">{miningStatus}</p>
            </div>
          )}

          {phase === "logging-in" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">Logging in...</p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
