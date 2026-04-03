import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { login, createUser, getMyUser } from "~/server/user.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  cachePasswordKey,
} from "~/lib/auth";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";

export const Route = createFileRoute("/")({
  loader: async () => {
    const user = await getMyUser();
    return { user };
  },
  component: LandingPage,
});

function parseKeypearAddress(input: string): number | null {
  const match = input.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

function LandingPage() {
  const { user } = Route.useLoaderData();

  // Already logged in with password — go to inbox
  if (user?.hasPassword) {
    window.location.href = "/inbox";
    return null;
  }

  // Already logged in without password — go to welcome/save page
  if (user) {
    window.location.href = "/welcome";
    return null;
  }

  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleLogin(e: React.FormEvent) {
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
      window.location.href = "/inbox";
    } catch {
      setError("Invalid KeyPears address or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      await createUser();
      window.location.href = "/welcome";
    } catch {
      setError("Failed to create account.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img
              src={$icon("/images/keypears-64.webp")}
              alt="KeyPears"
              className="h-10 w-10"
            />
            <h1 className="text-foreground text-3xl font-bold">KeyPears</h1>
          </div>
          <form
            onSubmit={handleLogin}
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
          <div className="border-border/30 mt-6 border-t pt-6">
            <p className="text-muted-foreground mb-3 text-sm">
              New here?
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-accent hover:text-accent/80 cursor-pointer text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create a new account"}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
