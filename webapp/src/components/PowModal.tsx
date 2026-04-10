import { useEffect, useRef, useCallback } from "react";
import {
  usePowMiner,
  type PowChallenge,
  type PowSolution,
} from "~/lib/use-pow-miner";
import { Loader2, CheckCircle2, X } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";

interface PowModalProps {
  challenge: PowChallenge | null;
  onComplete: (solution: PowSolution) => void;
  onCancel: () => void;
}

export function PowModal({ challenge, onComplete, onCancel }: PowModalProps) {
  const miner = usePowMiner();
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!challenge) {
      startedRef.current = null;
      return;
    }

    // Prevent re-mining the same challenge
    const challengeKey = challenge.header;
    if (startedRef.current === challengeKey) return;
    startedRef.current = challengeKey;

    miner
      .mine(challenge, { showSolved: true })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when challenge changes
  }, [challenge]);

  if (!challenge) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div className="bg-background border-border relative z-10 w-full max-w-sm rounded-lg border p-6 shadow-lg">
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground absolute top-3 right-3"
        >
          <X className="h-4 w-4" />
        </button>

        {miner.phase === "mining" && (
          <div className="flex flex-col items-center">
            <Loader2 className="text-accent mb-4 h-8 w-8 animate-spin" />
            <p className="text-foreground mb-1 text-sm font-medium">
              Computing proof of work...
            </p>
            <p className="text-muted-foreground mb-5 text-center text-xs">
              This short computation protects the network from spam while
              keeping your identity private.
            </p>
            <div className="bg-background-dark mb-3 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full transition-all duration-300"
                style={{ width: `${miner.progress}%` }}
              />
            </div>
            <div className="text-muted-foreground flex w-full items-center justify-between text-xs">
              <PowBadge difficulty={miner.difficulty} />
              <span>{miner.timeRemaining} remaining</span>
            </div>
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground mt-5 text-sm underline"
            >
              Cancel
            </button>
          </div>
        )}

        {miner.phase === "solved" && (
          <SolvedState onContinue={() => {
            if (miner.result) onComplete(miner.result);
          }} />
        )}

        {miner.phase === "idle" && (
          <div className="flex flex-col items-center py-2">
            <Loader2 className="text-accent mb-3 h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Preparing...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SolvedState({ onContinue }: { onContinue: () => void }) {
  const calledRef = useRef(false);

  const handleContinue = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onContinue();
  }, [onContinue]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleContinue();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);

    // Auto-continue after 1.5 seconds
    const timer = setTimeout(handleContinue, 1500);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      clearTimeout(timer);
    };
  }, [handleContinue]);

  return (
    <div className="flex flex-col items-center py-2">
      <CheckCircle2 className="text-accent mb-3 h-8 w-8" />
      <p className="text-accent mb-4 text-sm font-medium">
        Proof of work complete!
      </p>
      <button
        onClick={handleContinue}
        className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-6 py-2 text-sm transition-all"
      >
        Continue
      </button>
    </div>
  );
}
