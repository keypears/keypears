import type { MetaFunction } from "react-router";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { calculatePasswordEntropy } from "@keypears/lib";
import { cn } from "~app/lib/utils";

export default function NewVaultStep3() {
  const location = useLocation();
  const navigate = useNavigate();
  const { vaultName, password } =
    (location.state as { vaultName?: string; password?: string }) || {};

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  // Redirect to step 1 if missing previous state
  useEffect(() => {
    if (!vaultName || !password) {
      navigate("/new-vault/1");
    }
  }, [vaultName, password, navigate]);

  if (!vaultName || !password) {
    return null;
  }

  const pinsMatch = pin === confirmPin;
  const isPinValid = pin.length >= 4 && pin.length <= 6;
  const isFormValid = isPinValid && pinsMatch && confirmPin.length > 0;

  // Calculate entropy for PIN
  const entropy =
    pin.length > 0
      ? calculatePasswordEntropy(pin.length, {
          lowercase: /[a-z]/.test(pin),
          uppercase: /[A-Z]/.test(pin),
          numbers: /[0-9]/.test(pin),
          symbols: /[^a-zA-Z0-9]/.test(pin),
        })
      : 0;

  const handleContinue = () => {
    if (!isFormValid) return;

    navigate("/new-vault/4", {
      state: {
        vaultName,
        password,
        pin,
      },
    });
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Create New Vault</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Vault: <span className="font-mono">{vaultName}@localhost</span>
              </p>
            </div>

            <div className="mb-6">
              <h2 className="mb-4 text-lg font-semibold">Choose your PIN</h2>

              <p className="text-muted-foreground mb-4 text-sm">
                Your PIN encrypts your password key on this device for quick
                unlock. It should be easy to remember but hard to guess. 4-6
                characters.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pin" className="text-sm font-medium">
                    PIN
                  </label>
                  <div className="relative">
                    <Input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter your PIN"
                      maxLength={6}
                      className={
                        pin.length > 0 && !isPinValid
                          ? "border-destructive pr-10"
                          : "pr-10"
                      }
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setShowPin(!showPin)}
                        aria-label={showPin ? "Hide PIN" : "Show PIN"}
                      >
                        {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {pin.length} characters
                    </span>
                    {pin.length > 0 && (
                      <span
                        className={cn(
                          entropy >= 30 && "text-green-500",
                          entropy >= 20 && entropy < 30 && "text-yellow-500",
                          entropy < 20 && "text-destructive",
                        )}
                      >
                        {entropy.toFixed(1)} bits entropy
                      </span>
                    )}
                  </div>
                  {pin.length > 0 && !isPinValid && (
                    <p className="text-destructive text-xs">
                      PIN must be 4-6 characters
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-pin" className="text-sm font-medium">
                    Confirm PIN
                  </label>
                  <div className="relative">
                    <Input
                      id="confirm-pin"
                      type={showConfirmPin ? "text" : "password"}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Confirm your PIN"
                      maxLength={6}
                      className={
                        confirmPin.length > 0 && !pinsMatch
                          ? "border-destructive pr-10"
                          : "pr-10"
                      }
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setShowConfirmPin(!showConfirmPin)}
                        aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
                      >
                        {showConfirmPin ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </Button>
                    </div>
                  </div>
                  {confirmPin.length > 0 && !pinsMatch && (
                    <p className="text-destructive text-xs">
                      PINs do not match
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleContinue}
                disabled={!isFormValid}
              >
                Continue
              </Button>
              <div className="text-center">
                <Link
                  to="/new-vault/2"
                  state={{ vaultName, password }}
                  className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
                >
                  Back
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Choose PIN | KeyPears" },
    { name: "description", content: "Choose a PIN for your vault" },
  ];
};
