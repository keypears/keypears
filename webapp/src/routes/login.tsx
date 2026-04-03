import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { login } from "~/server/user.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  cachePasswordKey,
} from "~/lib/auth";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function LoginPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseKeypearAddress(address);
    if (id == null) {
      setError("Enter a valid KeyPears address (e.g. 1@keypears.com).");
      return;
    }
    setLoading(true);
    try {
      const passwordKey = derivePasswordKey(password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      await login({ data: { id, loginKey } });
      cachePasswordKey(passwordKey);
      navigate({ to: "/inbox" });
    } catch {
      setError("Invalid KeyPears address or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex justify-end px-6 py-4">
        <span className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <a
            href="/"
            className="text-accent hover:text-accent/80 no-underline"
          >
            Create one
          </a>
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img
              src={$icon("/images/keypears-64.webp")}
              alt="KeyPears"
              className="h-10 w-10"
            />
            <h1 className="text-foreground text-3xl font-bold">Log In</h1>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 text-left"
          >
            <input
              type="text"
              placeholder="KeyPears address (e.g. 1@keypears.com)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
              required
            />
            {error && <p className="text-danger text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
