import { useState, useEffect } from "react";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Slider } from "~/components/ui/slider";
import { Progress } from "~/components/ui/progress";
import {
  generateSecurePassword,
  calculatePasswordEntropy,
} from "@keypears/lib";
import type { Route } from "./+types/secret";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Password Generator | KeyPears" },
    {
      name: "description",
      content: "Generate secure passwords with KeyPears",
    },
  ];
}

export default function Secret() {
  const [password, setPassword] = useState("");
  const [length, setLength] = useState(16);
  const [lowercase, setLowercase] = useState(true);
  const [uppercase, setUppercase] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [entropy, setEntropy] = useState(0);

  // Generate password whenever settings change
  useEffect(() => {
    const newPassword = generateSecurePassword({
      length,
      lowercase,
      uppercase,
      numbers,
      symbols,
    });
    setPassword(newPassword);

    const newEntropy = calculatePasswordEntropy(length, {
      lowercase,
      uppercase,
      numbers,
      symbols,
    });
    setEntropy(newEntropy);
  }, [length, lowercase, uppercase, numbers, symbols]);

  const getEntropyLabel = (entropy: number): string => {
    if (entropy < 75) return "Weak";
    if (entropy < 100) return "Good";
    if (entropy < 128) return "Strong";
    return "Excellent";
  };

  const getEntropyProgress = (entropy: number): number => {
    // Map entropy to 0-100 scale
    // < 75: 0-50%
    // 75-100: 50-75%
    // 100-128: 75-90%
    // >= 128: 90-100%
    if (entropy < 75) return (entropy / 75) * 50;
    if (entropy < 100) return 50 + ((entropy - 75) / 25) * 25;
    if (entropy < 128) return 75 + ((entropy - 100) / 28) * 15;
    return Math.min(90 + ((entropy - 128) / 128) * 10, 100);
  };

  const getEntropyColor = (entropy: number): string => {
    if (entropy < 75) return "progress-red";
    if (entropy < 100) return "progress-yellow";
    if (entropy < 128) return "progress-green";
    return "progress-blue";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Header />

        <div className="mt-8">
          <div className="rounded-lg border border-border bg-card p-8">
            <h1 className="mb-6 text-2xl font-bold">Password Generator</h1>

            {/* Password Display */}
            <div className="mb-6">
              <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4">
                <input
                  type="text"
                  readOnly
                  value={password}
                  className="flex-1 bg-transparent font-mono text-lg text-foreground outline-none"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy to clipboard"
                  onClick={() => navigator.clipboard.writeText(password)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Regenerate password"
                  onClick={() => {
                    const newPassword = generateSecurePassword({
                      length,
                      lowercase,
                      uppercase,
                      numbers,
                      symbols,
                    });
                    setPassword(newPassword);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Entropy Meter */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-foreground">
                  Entropy: {entropy.toFixed(1)} bits
                </span>
                <span className="text-muted-foreground">
                  {getEntropyLabel(entropy)}
                </span>
              </div>
              <Progress
                value={getEntropyProgress(entropy)}
                className={getEntropyColor(entropy)}
              />
            </div>

            {/* Length Slider */}
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="length" className="text-sm font-medium">
                  Length
                </label>
                <span className="text-sm text-muted-foreground">{length}</span>
              </div>
              <Slider
                id="length"
                value={[length]}
                onValueChange={(value) => setLength(value[0] || 16)}
                min={8}
                max={64}
                step={1}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>8</span>
                <span>64</span>
              </div>
            </div>

            {/* Character Sets */}
            <div className="mb-6 space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Character Sets</div>
                <p className="text-sm text-muted-foreground">
                  We recommend all lowercase passwords for ease of typing on
                  mobile and desktop.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="lowercase"
                    checked={lowercase}
                    onCheckedChange={(checked) =>
                      setLowercase(checked === true)
                    }
                  />
                  <label
                    htmlFor="lowercase"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Lowercase (a-z)
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="uppercase"
                    checked={uppercase}
                    onCheckedChange={(checked) =>
                      setUppercase(checked === true)
                    }
                  />
                  <label
                    htmlFor="uppercase"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Uppercase (A-Z)
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="numbers"
                    checked={numbers}
                    onCheckedChange={(checked) => setNumbers(checked === true)}
                  />
                  <label
                    htmlFor="numbers"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Numbers (0-9)
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="symbols"
                    checked={symbols}
                    onCheckedChange={(checked) => setSymbols(checked === true)}
                  />
                  <label
                    htmlFor="symbols"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Symbols (!@#$%^&*()-_=+[]&#123;&#125;|;:,.&lt;&gt;?)
                  </label>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                const newPassword = generateSecurePassword({
                  length,
                  lowercase,
                  uppercase,
                  numbers,
                  symbols,
                });
                setPassword(newPassword);
              }}
            >
              Generate New Password
            </Button>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
