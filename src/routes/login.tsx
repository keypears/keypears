import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { login } from "~/server/rickroll.functions";
import { deriveLoginKey } from "~/lib/auth";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginKey = deriveLoginKey(password);
      await login({ data: { id: Number(id), loginKey } });
      window.location.href = "/home";
    } catch {
      setError("Invalid Rick Roll number or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center font-sans">
      <div className="w-full max-w-sm">
        <h1 className="text-accent mb-6 text-center text-3xl font-bold">
          Log In
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="number"
            placeholder="Rick Roll #"
            value={id}
            onChange={(e) => setId(e.target.value)}
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
            className="bg-accent/15 border-accent/50 hover:bg-accent/30 text-accent rounded border px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
        <p className="text-foreground-dark mt-6 text-center text-sm">
          Don&apos;t have an account?{" "}
          <a href="/" className="text-accent no-underline">
            Get Rick Rolled!
          </a>
        </p>
      </div>
    </div>
  );
}
