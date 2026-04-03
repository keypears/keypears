import {
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { login, createUser, getMyUser } from "~/server/user.functions";
import { getPowChallenge } from "~/server/pow.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  cachePasswordKey,
} from "~/lib/auth";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";

export const Route = createFileRoute("/")({
  loader: async () => {
    const user = await getMyUser();
    if (user?.hasPassword) throw redirect({ to: "/inbox" });
    if (user) throw redirect({ to: "/welcome" });
  },
  component: LandingPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function LandingPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [miningStatus, setMiningStatus] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseKeypearAddress(address);
    if (id == null) {
      setError("Enter a valid KeyPears address (e.g. 1@keypears.com).");
      return;
    }
    setLoading(true);
    try {
      const passwordKey = derivePasswordKey(password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      await login({ data: { id, loginKey } });
      cachePasswordKey(passwordKey);
      navigate({ to: "/inbox" });
    } catch {
      setError("Invalid KeyPears address or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    setMiningStatus("Getting challenge...");
    try {
      // 1. Get challenge from server (no DB write)
      const challenge = await getPowChallenge();

      // 2. Mine the solution (client-side)
      setMiningStatus("Computing proof of work...");
      const { Pow5_64b_Wasm } = await import("@keypears/pow5");
      const { FixedBuf } = await import("@webbuf/fixedbuf");
      const { WebBuf } = await import("@webbuf/webbuf");

      const headerBuf = FixedBuf.fromHex(64, challenge.header);
      const targetBuf = FixedBuf.fromHex(32, challenge.target);

      let solvedHeader: FixedBuf<64> | null = null;
      let nonce = 0;

      while (!solvedHeader) {
        // Insert nonce into header
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

        const { hashMeetsTarget } = await import("@keypears/pow5");
        if (hashMeetsTarget(hash, targetBuf)) {
          solvedHeader = testHeader;
        }

        nonce++;
        // Yield to UI every 10,000 iterations
        if (nonce % 10000 === 0) {
          setMiningStatus(
            `Computing proof of work... (${(nonce / 1000).toFixed(0)}k hashes)`,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // 3. Create account with proof
      setMiningStatus("Creating account...");
      await createUser({
        data: {
          solvedHeader: solvedHeader.buf.toHex(),
          target: challenge.target,
          expiresAt: challenge.expiresAt,
          signature: challenge.signature,
        },
      });

      navigate({ to: "/welcome" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account.",
      );
    } finally {
      setCreating(false);
      setMiningStatus("");
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img
              src={$icon("/images/keypears-64.webp")}
              alt="KeyPears"
              className="h-10 w-10"
            />
            <h1 className="text-foreground text-3xl font-bold">KeyPears</h1>
          </div>
          <form
            onSubmit={handleLogin}
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
              disabled={loading}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>
          <div className="border-border/30 mt-6 border-t pt-6">
            <p className="text-muted-foreground mb-3 text-sm">New here?</p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-accent hover:text-accent/80 cursor-pointer text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? miningStatus || "Creating..." : "Create a new account"}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
