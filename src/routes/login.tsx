import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { login } from "~/server/keypears.functions";
import { deriveLoginKey } from "~/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function LoginPage() {
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
      const loginKey = deriveLoginKey(password);
      await login({ data: { id, loginKey } });
      window.location.href = "/";
    } catch {
      setError("Invalid KeyPears address or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center font-sans">
      <div className="w-full max-w-sm">
        <h1 className="text-foreground mb-6 text-center text-3xl font-bold">
          Log In
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <p className="text-foreground-dark mt-6 text-center text-sm">
          Don&apos;t have an account?{" "}
          <a href="/" className="text-accent no-underline">
            Get started
          </a>
        </p>
      </div>
    </div>
  );
}
