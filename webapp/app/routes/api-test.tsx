import { useState, useMemo } from "react";
import { WebBuf } from "@keypears/lib";
import { createClient } from "@keypears/api-server/client";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { Route } from "./+types/api-test";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "API Test | KeyPears" },
    {
      name: "description",
      content: "Test the KeyPears Blake3 hashing API",
    },
  ];
}

export default function ApiTest() {
  const [inputText, setInputText] = useState<string>("");
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleHash(): Promise<void> {
    if (!inputText) {
      setError("Please enter some text to hash");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = createClient();
      const inputBuf = WebBuf.fromUtf8(inputText);
      const base64Data = inputBuf.toBase64();
      const result = await client.api.blake3({ data: base64Data });
      setHash(result.hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hash data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Header />

        <div className="mt-16">
          <h1 className="text-3xl font-bold">API Test</h1>
          <p className="text-muted-foreground mt-2">
            Test the Blake3 hashing API by entering text below
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="input-text"
                className="text-foreground mb-2 block text-sm font-medium"
              >
                Input Text
              </label>
              <Input
                id="input-text"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter text to hash..."
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleHash();
                  }
                }}
              />
            </div>

            <Button onClick={() => void handleHash()} disabled={loading}>
              {loading ? "Hashing..." : "Hash"}
            </Button>

            {error && (
              <div className="bg-destructive/10 text-destructive border-destructive/20 rounded-md border p-4">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {hash && (
              <div className="border-primary/20 bg-primary/5 rounded-md border p-4">
                <h3 className="text-foreground mb-2 text-sm font-medium">
                  Blake3 Hash:
                </h3>
                <p className="text-primary font-mono text-sm break-all">
                  {hash}
                </p>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
