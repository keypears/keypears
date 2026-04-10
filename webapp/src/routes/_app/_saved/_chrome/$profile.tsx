import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getProfile, getPowHistoryForAddress } from "~/server/user.functions";
import { parseAddress } from "~/lib/config";
import { CircleUser, Copy, Check } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  loader: async ({ params }) => {
    const parsed = parseAddress(params.profile);
    if (!parsed) throw notFound();

    const [profileData, powHistory] = await Promise.all([
      getProfile({ data: params.profile }),
      getPowHistoryForAddress({ data: { address: params.profile } }),
    ]);
    if (!profileData) throw notFound();

    return {
      address: params.profile,
      powTotal: profileData.powTotal,
      powHistory,
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { address, powTotal, powHistory: initialHistory } =
    Route.useLoaderData();
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHistory.length >= 20);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || history.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getPowHistoryForAddress({
        data: { address, beforeId: history[history.length - 1].id },
      });
      if (older.length < 20) setHasMore(false);
      setHistory((prev) => [...prev, ...older]);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col items-center pt-32 font-sans">
      <CircleUser className="text-muted-foreground h-24 w-24" />
      <button
        onClick={handleCopy}
        className="text-foreground hover:text-accent mt-6 inline-flex cursor-pointer items-center gap-2 text-2xl font-bold transition-colors"
        title="Copy address"
      >
        {address}
        {copied ? (
          <Check className="h-5 w-5 text-green-500" />
        ) : (
          <Copy className="text-muted-foreground h-5 w-5" />
        )}
      </button>

      {BigInt(powTotal) > 0n && (
        <div className="mt-6">
          <PowBadge difficulty={BigInt(powTotal)} label="total proof-of-work" />
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8 w-full max-w-sm">
          <h2 className="text-foreground mb-3 text-center text-sm font-semibold">
            Proof of Work History
          </h2>
          <div className="flex flex-col gap-1">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="text-muted-foreground flex items-center justify-between px-2 py-1.5 text-xs"
              >
                <PowBadge difficulty={BigInt(entry.difficulty)} />
                <span>
                  {new Date(entry.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-accent hover:text-accent/80 mt-3 w-full text-center text-xs disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
