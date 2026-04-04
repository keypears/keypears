import {
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState, useRef } from "react";
import { createUser, getMyUser } from "~/server/user.functions";
import { getPowChallenge } from "~/server/pow.functions";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";
import { Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: async () => {
    const user = await getMyUser();
    if (user?.hasPassword) throw redirect({ to: "/inbox" });
    if (user) throw redirect({ to: "/welcome" });
  },
  component: LandingPage,
});

function formatTime(seconds: number): string {
  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

function LandingPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "fetching" | "mining" | "solved" | "creating"
  >("idle");
  const [hashCount, setHashCount] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef(0);

  async function handleCreate() {
    setPhase("fetching");
    setError("");
    try {
      const challenge = await getPowChallenge();
      setDifficulty(challenge.difficulty);

      setPhase("mining");
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
          setProgress(
            (elapsed / (elapsed + expectedRemaining)) * 100,
          );
          setTimeRemaining(formatTime(expectedRemaining));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      setPhase("solved");
      setProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setPhase("creating");
      await createUser({
        data: {
          solvedHeader: solvedHeaderHex,
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
      setPhase("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <img
              src={$icon("/images/keypears-200.webp")}
              alt="KeyPears"
              className="h-12 w-12"
            />
            <h1 className="text-foreground text-4xl font-bold">KeyPears</h1>
          </div>
          <p className="text-muted-foreground mb-8">
            Secret sharing system.
          </p>

          {phase === "idle" && (
            <>
              <button
                onClick={handleCreate}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-8 py-3 font-sans text-lg transition-all duration-300"
              >
                Create an Account
              </button>
              {error && <p className="text-danger mt-4 text-sm">{error}</p>}
              <p className="text-muted-foreground mt-4 text-sm">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-accent hover:text-accent/80 no-underline"
                >
                  Log in
                </a>
              </p>
            </>
          )}

          {phase === "fetching" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                Preparing your account...
              </p>
            </div>
          )}

          {phase === "mining" && (
            <div className="mx-auto max-w-sm">
              <div className="mb-4 flex flex-col items-center gap-3">
                <Loader2 className="text-accent h-8 w-8 animate-spin" />
                <p className="text-foreground text-sm font-medium">
                  Proving you&apos;re not a bot...
                </p>
              </div>
              <p className="text-muted-foreground mb-4 text-xs">
                KeyPears uses a short proof-of-work computation instead of
                CAPTCHAs or email verification. This protects the network from
                spam while keeping your identity private.
              </p>
              {/* Progress bar */}
              <div className="bg-background-dark mb-3 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>
                  {(hashCount / 1000).toFixed(0)}k /{" "}
                  {(difficulty / 1000).toFixed(0)}k hashes
                </span>
                <span>{timeRemaining} remaining</span>
              </div>
            </div>
          )}

          {phase === "solved" && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="text-accent h-8 w-8" />
              <p className="text-accent text-sm font-medium">
                Proof of work complete!
              </p>
            </div>
          )}

          {phase === "creating" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                Creating your account...
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
