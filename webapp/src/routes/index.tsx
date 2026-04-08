import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createUser, getMyUser } from "~/server/user.functions";
import { getPowChallenge } from "~/server/pow.functions";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: async () => {
    const user = await getMyUser();
    if (user?.hasPassword) throw redirect({ to: "/inbox" });
    if (user) throw redirect({ to: "/welcome" });
  },
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [pagePhase, setPagePhase] = useState<"idle" | "fetching" | "creating">(
    "idle",
  );
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  async function handleCreate() {
    setPagePhase("fetching");
    setError("");
    try {
      const challenge = await getPowChallenge();
      setPowChallenge(challenge);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account.",
      );
      setPagePhase("idle");
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    setPagePhase("creating");
    try {
      await createUser({ data: solution });
      navigate({ to: "/welcome" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account.",
      );
      setPagePhase("idle");
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    setPagePhase("idle");
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <picture>
              <source
                srcSet={`${$icon("/images/keypears-dark-200.webp")} 1x, ${$icon("/images/keypears-dark-400.webp")} 2x`}
                media="(prefers-color-scheme: dark)"
              />
              <img
                src={$icon("/images/keypears-light-200.webp")}
                srcSet={`${$icon("/images/keypears-light-200.webp")} 1x, ${$icon("/images/keypears-light-400.webp")} 2x`}
                alt="KeyPears"
                className="h-12 w-12"
              />
            </picture>
            <h1 className="text-foreground text-4xl font-bold">KeyPears</h1>
          </div>
          <p className="text-muted-foreground mb-8">
            Diffie-Hellman Key Exchange
          </p>

          {pagePhase === "idle" && (
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

          {pagePhase === "fetching" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                Preparing your account...
              </p>
            </div>
          )}

          {pagePhase === "creating" && (
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

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
