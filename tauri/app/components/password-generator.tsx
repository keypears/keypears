import { useState, useEffect } from "react";
import { Button } from "~app/components/ui/button";
import { Checkbox } from "~app/components/ui/checkbox";
import { Slider } from "~app/components/ui/slider";
import { Progress } from "~app/components/ui/progress";
import { Copy, Check, RotateCw } from "lucide-react";
import {
  generateSecurePassword,
  calculatePasswordEntropy,
} from "@keypears/lib";

export function PasswordGenerator() {
  const [password, setPassword] = useState("");
  const [length, setLength] = useState(16);
  const [lowercase, setLowercase] = useState(true);
  const [uppercase, setUppercase] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [entropy, setEntropy] = useState(0);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
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
            size={copied ? "sm" : "icon-sm"}
            aria-label="Copy to clipboard"
            className={copied ? "text-green-500" : ""}
            onClick={() => {
              navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <>
                <Check size={16} className="mr-1" />
                <span className="text-xs">Copied</span>
              </>
            ) : (
              <Copy size={20} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Regenerate password"
            onClick={() => {
              setRefreshing(true);
              const newPassword = generateSecurePassword({
                length,
                lowercase,
                uppercase,
                numbers,
                symbols,
              });
              setPassword(newPassword);
              setTimeout(() => setRefreshing(false), 1000);
            }}
          >
            <RotateCw
              size={20}
              className={refreshing ? "animate-spin" : ""}
            />
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
        <Progress value={getEntropyProgress(entropy)} />
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
            We recommend all lowercase passwords for ease of typing on mobile
            and desktop.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="lowercase"
              checked={lowercase}
              onCheckedChange={(checked) => setLowercase(checked === true)}
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
              onCheckedChange={(checked) => setUppercase(checked === true)}
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
          setRefreshing(true);
          const newPassword = generateSecurePassword({
            length,
            lowercase,
            uppercase,
            numbers,
            symbols,
          });
          setPassword(newPassword);
          setTimeout(() => setRefreshing(false), 1000);
        }}
      >
        Generate New Password
      </Button>
    </div>
  );
}
