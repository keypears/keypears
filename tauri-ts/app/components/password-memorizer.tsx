import { useState, useRef, useEffect } from "react";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Check, X, RotateCw } from "lucide-react";

interface Attempt {
  value: string;
  correct: boolean;
  timestamp: number;
}

type Stage = "setup" | "confirm" | "practice";

export function PasswordMemorizer() {
  const [stage, setStage] = useState<Stage>("setup");
  const [masterPassword, setMasterPassword] = useState("");
  const [setupInput, setSetupInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [currentInput, setCurrentInput] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [lastResult, setLastResult] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [stage, attempts.length]);

  const handleSetup = () => {
    if (setupInput.length === 0) return;
    setMasterPassword(setupInput);
    setStage("confirm");
  };

  const handleConfirm = () => {
    if (confirmInput === masterPassword) {
      setStage("practice");
    } else {
      setConfirmError("Passwords don't match. Try again.");
    }
  };

  const handlePractice = () => {
    if (currentInput.length === 0) return;

    const correct = currentInput === masterPassword;
    const newAttempt: Attempt = {
      value: currentInput,
      correct,
      timestamp: Date.now(),
    };

    setAttempts([...attempts, newAttempt]);
    setLastResult(correct);
    setCurrentInput("");

    // Clear result message after 2 seconds
    setTimeout(() => setLastResult(null), 2000);
  };

  const handleReset = () => {
    setStage("setup");
    setMasterPassword("");
    setSetupInput("");
    setConfirmInput("");
    setConfirmError("");
    setCurrentInput("");
    setAttempts([]);
    setLastResult(null);
  };

  const correctCount = attempts.filter((a) => a.correct).length;
  const totalCount = attempts.length;
  const successRate = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  if (stage === "setup") {
    return (
      <div className="border-border bg-card rounded-lg border p-8">
        <h1 className="mb-6 text-2xl font-bold">Password Memorizer</h1>

        <div className="mb-6">
          <p className="text-muted-foreground mb-4 text-sm">
            Practice memorizing a password through repetition. This tool helps
            you build muscle memory by typing the password multiple times without
            visual feedback.
          </p>

          <div className="space-y-2">
            <label htmlFor="setup-password" className="text-sm font-medium">
              Enter a password to memorize
            </label>
            <Input
              ref={inputRef}
              id="setup-password"
              type="password"
              value={setupInput}
              onChange={(e) => setSetupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && setupInput.length > 0) {
                  handleSetup();
                }
              }}
              placeholder="Enter password"
              autoFocus
            />
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handleSetup}
          disabled={setupInput.length === 0}
        >
          Continue
        </Button>
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <div className="border-border bg-card rounded-lg border p-8">
        <h1 className="mb-6 text-2xl font-bold">Confirm Password</h1>

        <div className="mb-6">
          <p className="text-muted-foreground mb-4 text-sm">
            Type the password again to confirm you entered it correctly.
          </p>

          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm your password
            </label>
            <Input
              ref={inputRef}
              id="confirm-password"
              type="password"
              value={confirmInput}
              onChange={(e) => {
                setConfirmInput(e.target.value);
                setConfirmError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmInput.length > 0) {
                  handleConfirm();
                }
              }}
              placeholder="Re-enter password"
              className={confirmError ? "border-destructive" : ""}
              autoFocus
            />
            {confirmError && (
              <p className="text-destructive text-xs">{confirmError}</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleConfirm}
            disabled={confirmInput.length === 0}
          >
            Start Practice
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStage("setup");
              setConfirmInput("");
              setConfirmError("");
            }}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  // Practice stage
  return (
    <div className="border-border bg-card rounded-lg border p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Practice</h1>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCw size={16} className="mr-2" />
          Reset
        </Button>
      </div>

      {/* Score */}
      <div className="border-border bg-secondary mb-6 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Score</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold">
              {correctCount}/{totalCount}
            </span>
            {totalCount > 0 && (
              <span
                className={`text-sm font-medium ${
                  successRate >= 90
                    ? "text-green-500"
                    : successRate >= 70
                      ? "text-yellow-500"
                      : "text-destructive"
                }`}
              >
                ({successRate.toFixed(0)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Current Input */}
      <div className="mb-6">
        <div className="space-y-2">
          <label htmlFor="practice-password" className="text-sm font-medium">
            Type the password
          </label>
          <Input
            ref={inputRef}
            id="practice-password"
            type="password"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && currentInput.length > 0) {
                handlePractice();
              }
            }}
            placeholder="Type password from memory"
            autoFocus
          />
          <div className="h-6 min-h-6">
            {lastResult !== null && (
              <div
                className={`flex items-center gap-2 text-sm font-medium ${
                  lastResult ? "text-green-500" : "text-destructive"
                }`}
              >
                {lastResult ? (
                  <>
                    <Check size={16} />
                    <span>Passwords match!</span>
                  </>
                ) : (
                  <>
                    <X size={16} />
                    <span>Passwords don't match</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      {attempts.length > 0 && (
        <div className="border-border rounded-lg border">
          <div className="border-border border-b p-3">
            <h3 className="text-sm font-semibold">Attempt History</h3>
          </div>
          <div className="p-3">
            <div className="space-y-2">
              {[...attempts].reverse().map((attempt, reverseIndex) => {
                const index = attempts.length - 1 - reverseIndex;
                return (
                  <div
                    key={attempt.timestamp}
                    className="border-border flex items-center gap-3 rounded-md border p-2"
                  >
                    <div
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                        attempt.correct ? "bg-green-500/10" : "bg-red-500/10"
                      }`}
                    >
                      {attempt.correct ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <X size={14} className="text-destructive" />
                      )}
                    </div>
                    <span className="text-muted-foreground flex-1 font-mono text-sm">
                      Attempt #{index + 1}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        attempt.correct ? "text-green-500" : "text-destructive"
                      }`}
                    >
                      {attempt.correct ? "Match" : "No match"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {attempts.length === 0 && (
        <div className="border-border bg-muted/50 rounded-lg border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Start typing the password from memory. Press Enter to check each
            attempt.
          </p>
        </div>
      )}
    </div>
  );
}
