import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { usePowMiner } from "~/lib/use-pow-miner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function LoginPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pagePhase, setPagePhase] = useState<"idle" | "mining" | "logging-in">(
    "idle",
  );
  const miner = usePowMiner();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseKeypearAddress(address);
    if (id == null) {
      setError("Enter a valid KeyPears address (e.g. 1@keypears.com).");
      return;
    }

    setPagePhase("mining");
    try {
      const challenge = await getLoginPowChallenge();
      const solution = await miner.mine(challenge);

      setPagePhase("logging-in");
      const passwordKey = derivePasswordKey(password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      await login({
        data: { id, loginKey, ...solution },
      });
      const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
      cacheEncryptionKey(encryptionKey);
      cacheEntropyTier(entropyTier(calculatePasswordEntropy(password)));
      navigate({ to: "/inbox" });
    } catch {
      setError("Invalid KeyPears address or password.");
      setPagePhase("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex justify-end px-6 py-4">
        <span className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <a href="/" className="text-accent hover:text-accent/80 no-underline">
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

          {pagePhase === "idle" && (
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

          {pagePhase === "mining" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                Verifying... {miner.timeRemaining} remaining
              </p>
            </div>
          )}

          {pagePhase === "logging-in" && (
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
