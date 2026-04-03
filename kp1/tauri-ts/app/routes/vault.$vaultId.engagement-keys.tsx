import type { Route } from "./+types/vault.$vaultId.engagement-keys";
import { useState } from "react";
import { Key, Plus, Copy, Eye, EyeOff, Check } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-client";
import {
  getUnlockedVault,
  getSessionToken,
  getVaultKey,
} from "~app/lib/vault-store";
import { privateKeyAdd, publicKeyCreate, FixedBuf } from "@keypears/lib";

interface EngagementKey {
  id: string;
  engagementPubKey: string;
  createdAt: Date;
  purpose: "send" | "receive" | "manual";
  counterpartyAddress: string | null;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const timestamp = date.getTime();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function KeyCard({
  engagementKey,
  vaultId,
  vaultDomain,
}: {
  engagementKey: EngagementKey;
  vaultId: string;
  vaultDomain: string;
}) {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPubKey, setCopiedPubKey] = useState(false);
  const [copiedPrivKey, setCopiedPrivKey] = useState(false);

  const handleShowPrivateKey = async () => {
    if (showPrivateKey) {
      // Hide private key
      setShowPrivateKey(false);
      setPrivateKey(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      // Get derivation private key from server
      const response = await client.api.getDerivationPrivKey({
        engagementKeyId: engagementKey.id,
      });

      // Get vault private key
      const vaultPrivKey = getVaultKey(vaultId);

      // Derive full private key: engagementPrivKey = vaultPrivKey + derivationPrivKey
      const derivationPrivKey = FixedBuf.fromHex(
        32,
        response.derivationPrivKey,
      );
      const engagementPrivKey = privateKeyAdd(vaultPrivKey, derivationPrivKey);

      // Verify the engagement public key matches
      const verifyPubKey = publicKeyCreate(engagementPrivKey);
      if (verifyPubKey.toHex() !== engagementKey.engagementPubKey) {
        throw new Error("Engagement key verification failed");
      }

      setPrivateKey(engagementPrivKey.toHex());
      setShowPrivateKey(true);
    } catch (err) {
      console.error("Error deriving private key:", err);
      setError(
        err instanceof Error ? err.message : "Failed to derive private key",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: "pub" | "priv") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "pub") {
        setCopiedPubKey(true);
        setTimeout(() => setCopiedPubKey(false), 2000);
      } else {
        setCopiedPrivKey(true);
        setTimeout(() => setCopiedPrivKey(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Get purpose badge color
  const purposeBadgeClass =
    engagementKey.purpose === "manual"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : engagementKey.purpose === "send"
        ? "bg-green-500/10 text-green-600 dark:text-green-400"
        : "bg-purple-500/10 text-purple-600 dark:text-purple-400";

  const purposeLabel =
    engagementKey.purpose.charAt(0).toUpperCase() +
    engagementKey.purpose.slice(1);

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      {/* Top: Badges row */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${purposeBadgeClass}`}
        >
          {purposeLabel}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {formatRelativeTime(engagementKey.createdAt)}
        </span>
      </div>

      {/* Public key + copy button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Key size={16} className="text-muted-foreground flex-shrink-0" />
          <div className="overflow-x-auto font-mono text-sm whitespace-nowrap">
            {engagementKey.engagementPubKey}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-20 flex-shrink-0"
          onClick={() => copyToClipboard(engagementKey.engagementPubKey, "pub")}
        >
          {copiedPubKey ? (
            <>
              <Check size={14} className="mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} className="mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Counterparty address (if set) */}
      {engagementKey.counterpartyAddress && (
        <div className="text-muted-foreground mt-1 text-sm">
          Counterparty: {engagementKey.counterpartyAddress}
        </div>
      )}

      {/* Bottom: Show/Hide button (left) + Copy (right) */}
      <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleShowPrivateKey}
          disabled={isLoading}
        >
          {isLoading ? (
            "..."
          ) : showPrivateKey ? (
            <>
              <EyeOff size={14} className="mr-1" />
              Hide Private Key
            </>
          ) : (
            <>
              <Eye size={14} className="mr-1" />
              Show Private Key
            </>
          )}
        </Button>
        {showPrivateKey && privateKey && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-20"
            onClick={() => copyToClipboard(privateKey, "priv")}
          >
            {copiedPrivKey ? (
              <>
                <Check size={14} className="mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} className="mr-1" />
                Copy
              </>
            )}
          </Button>
        )}
      </div>

      {/* Conditional: actual private key in mono box */}
      {showPrivateKey && privateKey && (
        <div className="bg-muted mt-2 overflow-x-auto rounded p-2 font-mono text-xs whitespace-nowrap">
          {privateKey}
        </div>
      )}

      {/* Conditional: error message */}
      {error && <div className="text-destructive mt-3 text-sm">{error}</div>}
    </div>
  );
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw new Response("Vault not unlocked", { status: 401 });
  }

  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Response("No session", { status: 401 });
  }

  const client = await createClientFromDomain(vault.vaultDomain, {
    sessionToken,
  });

  const response = await client.api.getEngagementKeys({
    vaultId,
    limit: 20,
  });

  return {
    vaultId,
    vaultDomain: vault.vaultDomain,
    keys: response.keys,
    hasMore: response.hasMore,
  };
}

export default function EngagementKeys({ loaderData }: Route.ComponentProps) {
  const {
    vaultId,
    vaultDomain,
    keys: initialKeys,
    hasMore: initialHasMore,
  } = loaderData;

  const [keys, setKeys] = useState<EngagementKey[]>(initialKeys);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateKey = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const response = await client.api.createEngagementKey({
        vaultId,
        purpose: "manual",
      });

      // Add new key to the beginning of the list
      setKeys((prev) => [
        {
          id: response.id,
          engagementPubKey: response.engagementPubKey,
          createdAt: response.createdAt,
          purpose: "manual",
          counterpartyAddress: null,
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Error generating key:", err);
      setError(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const lastKey = keys[keys.length - 1];
      const response = await client.api.getEngagementKeys({
        vaultId,
        limit: 20,
        beforeCreatedAt: lastKey?.createdAt,
      });

      setKeys((prev) => [...prev, ...response.keys]);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error("Error loading more keys:", err);
      setError(err instanceof Error ? err.message : "Failed to load more keys");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Engagement Keys</h1>
            <Button onClick={handleGenerateKey} disabled={isGenerating}>
              {isGenerating ? (
                "Generating..."
              ) : (
                <>
                  <Plus size={16} className="mr-2" />
                  Generate New Key
                </>
              )}
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Engagement keys are unique keypairs for DH key exchange. Only you
            can derive the private keys.
          </p>
        </div>

        {error && (
          <div className="border-destructive/50 bg-destructive/10 mb-4 rounded-lg border p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Key list */}
        <div className="space-y-3">
          {keys.length === 0 ? (
            <div className="border-border bg-card rounded-lg border p-8 text-center">
              <Key size={48} className="text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No engagement keys yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Click "Generate New Key" to create your first engagement key.
              </p>
            </div>
          ) : (
            keys.map((key) => (
              <KeyCard
                key={key.id}
                engagementKey={key}
                vaultId={vaultId}
                vaultDomain={vaultDomain}
              />
            ))
          )}
        </div>

        {/* Load more button */}
        {hasMore && keys.length > 0 && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
