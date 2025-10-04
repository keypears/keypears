import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
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
                  value="abcdefghijklmnop"
                  className="flex-1 bg-transparent font-mono text-lg text-foreground outline-none"
                />
                <button
                  type="button"
                  className="rounded-md p-2 text-primary transition-opacity hover:opacity-80"
                  aria-label="Copy to clipboard"
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
                </button>
                <button
                  type="button"
                  className="rounded-md p-2 text-primary transition-opacity hover:opacity-80"
                  aria-label="Regenerate password"
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
                </button>
              </div>
            </div>

            {/* Entropy Meter */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-foreground">Entropy: 75.2 bits</span>
                <span className="text-muted-foreground">Good</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: "60%" }}
                />
              </div>
            </div>

            {/* Length Slider */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="length" className="text-sm font-medium">
                  Length
                </label>
                <span className="text-sm text-muted-foreground">16</span>
              </div>
              <input
                id="length"
                type="range"
                min="8"
                max="64"
                defaultValue="16"
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>8</span>
                <span>64</span>
              </div>
            </div>

            {/* Character Sets */}
            <div className="mb-6 space-y-3">
              <div className="text-sm font-medium">Character Sets</div>
              <div className="space-y-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-border text-primary accent-primary"
                  />
                  <span className="text-sm">Lowercase (a-z)</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary accent-primary"
                  />
                  <span className="text-sm">Uppercase (A-Z)</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary accent-primary"
                  />
                  <span className="text-sm">Numbers (0-9)</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary accent-primary"
                  />
                  <span className="text-sm">
                    Symbols (!@#$%^&*()-_=+[]&#123;&#125;|;:,.&lt;&gt;?)
                  </span>
                </label>
              </div>
            </div>

            {/* Generate Button */}
            <button
              type="button"
              className="w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-80"
            >
              Generate New Password
            </button>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
