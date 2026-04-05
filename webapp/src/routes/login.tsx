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
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { Loader2 } from "lucide-react";
import { getServerDomain } from "~/server/config.functions";

export const Route = createFileRoute("/login")({
  ssr: false,
  loader: () => getServerDomain(),
  component: LoginPage,
});

function LoginPage() {
  const domain = Route.useLoaderData();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pagePhase, setPagePhase] = useState<"idle" | "logging-in">("idle");
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  // Store credentials while PoW is mining
  const credentialsRef = useRef<{ name: string; password: string } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const match = address.match(
      new RegExp(`^([^@]+)@${domain.replace(".", "\\.")}$`),
    );
    if (!match) {
      setError(`Enter a valid KeyPears address (e.g. name@${domain}).`);
      return;
    }

    credentialsRef.current = { name: match[1], password };

    try {
      const challenge = await getLoginPowChallenge();
      setPowChallenge(challenge);
    } catch {
      setError("Failed to start login. Please try again.");
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    const creds = credentialsRef.current;
    if (!creds) return;

    setPagePhase("logging-in");
    try {
      const passwordKey = derivePasswordKey(creds.password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      await login({
        data: { name: creds.name, loginKey, ...solution },
      });
      const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
      cacheEncryptionKey(encryptionKey);
      cacheEntropyTier(entropyTier(calculatePasswordEntropy(creds.password)));
      navigate({ to: "/inbox" });
    } catch {
      setError("Invalid KeyPears address or password.");
      setPagePhase("idle");
    } finally {
      credentialsRef.current = null;
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    credentialsRef.current = null;
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
                placeholder={`KeyPears address (e.g. name@${domain})`}
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

          {pagePhase === "logging-in" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">Logging in...</p>
            </div>
          )}
        </div>
      </div>
      <Footer />

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
