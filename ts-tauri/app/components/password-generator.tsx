import { useState, useEffect } from "react";
import { Button } from "~app/components/ui/button";
import { Checkbox } from "~app/components/ui/checkbox";
import { Slider } from "~app/components/ui/slider";
import { Copy, Check, RotateCw, Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);

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

  // Helper to calculate charset size
  const getCharsetSize = () => {
    let size = 0;
    if (lowercase) size += 26;
    if (uppercase) size += 26;
    if (numbers) size += 10;
    if (symbols) size += 33;
    return Math.max(size, 1); // Prevent division by zero
  };

  // Calculate length from target entropy
  const calculateLengthFromEntropy = (targetEntropy: number): number => {
    const charsetSize = getCharsetSize();
    const entropyPerChar = Math.log2(charsetSize);
    const calculatedLength = Math.ceil(targetEntropy / entropyPerChar);
    return Math.max(8, Math.min(64, calculatedLength)); // Clamp to valid range
  };

  // Handle entropy slider change
  const handleEntropyChange = (value: number[]) => {
    const targetEntropy = value[0] || 50;
    const newLength = calculateLengthFromEntropy(targetEntropy);
    setLength(newLength);
  };

  const getEntropyLabel = (entropy: number): string => {
    if (entropy < 75) return "Weak";
    if (entropy < 100) return "Good";
    if (entropy < 128) return "Strong";
    return "Excellent";
  };

  const getEntropyLabelColor = (entropy: number): string => {
    if (entropy < 75) return "text-red-500";
    if (entropy < 100) return "text-yellow-500";
    if (entropy < 128) return "text-green-500";
    return "text-blue-500";
  };

  // Count how many character sets are enabled
  const getEnabledCount = () => {
    let count = 0;
    if (lowercase) count++;
    if (uppercase) count++;
    if (numbers) count++;
    if (symbols) count++;
    return count;
  };

  return (
    <div className="border-border bg-card rounded-lg border p-8">
      <h1 className="mb-6 text-2xl font-bold">Password Generator</h1>

      {/* Password Display */}
      <div className="mb-6">
        <div className="border-border bg-secondary rounded-md border">
          {/* Password input - full width */}
          <div className="overflow-x-auto p-4">
            <pre className="text-foreground m-0 bg-transparent font-mono text-sm">
              {showPassword ? password : '•'.repeat(password.length)}
            </pre>
          </div>

          {/* Action buttons row */}
          <div className="border-border flex items-center justify-end gap-2 border-t p-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy to clipboard"
                onClick={() => {
                  navigator.clipboard.writeText(password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy size={20} />
              </Button>
              {copied && (
                <div className="animate-in fade-in slide-in-from-bottom-2 absolute -top-8 left-1/2 -translate-x-1/2 duration-200">
                  <div className="text-primary-foreground flex items-center gap-1 rounded-md bg-green-500 px-2 py-1 text-xs">
                    <Check size={12} />
                    <span>Copied</span>
                  </div>
                </div>
              )}
            </div>
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
              <RotateCw size={20} className={refreshing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </div>

      {/* Entropy Slider */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="entropy" className="text-sm font-medium">
            Entropy
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {entropy.toFixed(1)} bits
            </span>
            <span className={`text-sm ${getEntropyLabelColor(entropy)}`}>
              {getEntropyLabel(entropy)}
            </span>
          </div>
        </div>
        <Slider
          id="entropy"
          value={[entropy]}
          onValueChange={handleEntropyChange}
          min={50}
          max={200}
          step={1}
        />
        <div className="text-muted-foreground mt-2 flex justify-between text-xs">
          <span>50</span>
          <span>200</span>
        </div>
      </div>

      {/* Length Slider */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="length" className="text-sm font-medium">
            Length
          </label>
          <span className="text-muted-foreground text-sm">{length}</span>
        </div>
        <Slider
          id="length"
          value={[length]}
          onValueChange={(value) => setLength(value[0] || 16)}
          min={8}
          max={64}
          step={1}
        />
        <div className="text-muted-foreground mt-2 flex justify-between text-xs">
          <span>8</span>
          <span>64</span>
        </div>
      </div>

      {/* Character Sets */}
      <div className="mb-6 space-y-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Character Sets</div>
          <p className="text-muted-foreground text-sm">
            We recommend all lowercase passwords for ease of typing on mobile
            and desktop.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="lowercase"
              checked={lowercase}
              onCheckedChange={(checked) => {
                // Prevent unchecking if this is the last enabled character set
                if (!checked && getEnabledCount() <= 1) return;
                setLowercase(checked === true);
              }}
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
              onCheckedChange={(checked) => {
                // Prevent unchecking if this is the last enabled character set
                if (!checked && getEnabledCount() <= 1) return;
                setUppercase(checked === true);
              }}
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
              onCheckedChange={(checked) => {
                // Prevent unchecking if this is the last enabled character set
                if (!checked && getEnabledCount() <= 1) return;
                setNumbers(checked === true);
              }}
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
              onCheckedChange={(checked) => {
                // Prevent unchecking if this is the last enabled character set
                if (!checked && getEnabledCount() <= 1) return;
                setSymbols(checked === true);
              }}
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
    </div>
  );
}
