import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import type { Route } from "./+types/test-blake3";

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  const apiUrl = await invoke<string>("get_api_url_command");
  return { apiUrl };
}

export default function TestBlake3Page({ loaderData }: Route.ComponentProps) {
  const { apiUrl } = loaderData;
  const [inputText, setInputText] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleHash() {
    if (!inputText) {
      setError("Please enter some text to hash");
      return;
    }

    setLoading(true);
    setError(null);
    setHash(null);

    try {
      const encoder = new TextEncoder();
      const data = Array.from(encoder.encode(inputText));

      const hashHex = await invoke<string>("blake3_hash", { data });

      setHash(hashHex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hash data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="border-border bg-card rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Test Blake3</h2>
          <p className="text-muted-foreground mb-2 text-sm">
            Test the Blake3 hashing API via Tauri backend
          </p>
          <p className="text-muted-foreground mb-4 text-xs">
            API URL: <span className="font-mono">{apiUrl}</span>
          </p>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleHash();
            }}
          >
            <div>
              <label
                htmlFor="hash-input"
                className="text-foreground mb-2 block text-sm font-medium"
              >
                Input Text
              </label>
              <Input
                id="hash-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.currentTarget.value)}
                placeholder="Enter text to hash..."
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Hashing..." : "Hash"}
            </Button>
          </form>

          {error && (
            <div className="bg-destructive/10 text-destructive border-destructive/20 mt-4 rounded-md border p-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {hash && (
            <div className="border-primary/20 bg-primary/5 mt-4 rounded-md border p-4">
              <h3 className="text-foreground mb-2 text-sm font-medium">
                Blake3 Hash:
              </h3>
              <p className="text-primary font-mono text-sm break-all">{hash}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
