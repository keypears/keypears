import type { MetaFunction } from "react-router";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { calculatePasswordEntropy } from "@keypears/lib";
import { cn } from "~app/lib/utils";

export default function NewVaultStep2() {
  const location = useLocation();
  const navigate = useNavigate();
  const { vaultName } = (location.state as { vaultName?: string }) || {};

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Redirect to step 1 if no vault name
  useEffect(() => {
    if (!vaultName) {
      navigate("/new-vault/1");
    }
  }, [vaultName, navigate]);

  if (!vaultName) {
    return null;
  }

  const passwordsMatch = password === confirmPassword;
  const isPasswordValid = password.length >= 16;
  const isFormValid =
    isPasswordValid && passwordsMatch && confirmPassword.length > 0;

  // Calculate entropy
  const entropy =
    password.length > 0
      ? calculatePasswordEntropy(password.length, {
          lowercase: /[a-z]/.test(password),
          uppercase: /[A-Z]/.test(password),
          numbers: /[0-9]/.test(password),
          symbols: /[^a-zA-Z0-9]/.test(password),
        })
      : 0;

  const handleContinue = () => {
    if (!isFormValid) return;

    navigate("/new-vault/3", {
      state: {
        vaultName,
        password,
      },
    });
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Create New Vault</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Vault: <span className="font-mono">{vaultName}@localhost</span>
              </p>
            </div>

            <div className="mb-6">
              <h2 className="mb-4 text-lg font-semibold">
                Choose your password
              </h2>

              <p className="text-muted-foreground mb-4 text-sm">
                Your password protects your vault. Longer passwords are more
                secure. We recommend at least 16 lowercase characters (~75 bits
                of entropy).
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isFormValid) {
                          handleContinue();
                        }
                      }}
                      placeholder="Enter your password"
                      className={
                        password.length > 0 && !isPasswordValid
                          ? "border-destructive pr-10"
                          : "pr-10"
                      }
                      autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {password.length} characters
                    </span>
                    {password.length > 0 && (
                      <span
                        className={cn(
                          entropy >= 75 && "text-green-500",
                          entropy >= 50 && entropy < 75 && "text-yellow-500",
                          entropy < 50 && "text-destructive",
                        )}
                      >
                        {entropy.toFixed(1)} bits entropy
                      </span>
                    )}
                  </div>
                  {password.length > 0 && !isPasswordValid && (
                    <p className="text-destructive text-xs">
                      Password must be at least 16 characters
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirm-password"
                    className="text-sm font-medium"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isFormValid) {
                          handleContinue();
                        }
                      }}
                      placeholder="Confirm your password"
                      className={
                        confirmPassword.length > 0 && !passwordsMatch
                          ? "border-destructive pr-10"
                          : "pr-10"
                      }
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tabIndex={-1}
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        aria-label={
                          showConfirmPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </Button>
                    </div>
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="text-destructive text-xs">
                      Passwords do not match
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
                  to="/new-vault/1"
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
    { title: "Choose Password | KeyPears" },
    { name: "description", content: "Choose a password for your vault" },
  ];
};
