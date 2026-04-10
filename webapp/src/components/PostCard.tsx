import { useState } from "react";
import { PostContent } from "./PostContent";
import { PowBadge } from "./PowBadge";
import { PowModal } from "./PowModal";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";
import { boostPost, getPostBoosters } from "~/server/post.functions";
import { getPowChallenge } from "~/server/pow.functions";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { formatNumber } from "~/lib/format";

interface Post {
  id: string;
  senderAddress: string;
  content: string;
  difficulty: string;
  totalBoost: string;
  createdAt: Date;
}

export function PostCard({
  post,
  onBoostComplete,
}: {
  post: Post;
  onBoostComplete?: () => void;
}) {
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [showBoosters, setShowBoosters] = useState(false);
  const [boosters, setBoosters] = useState<
    { senderAddress: string; total: string }[] | null
  >(null);
  const [loadingBoosters, setLoadingBoosters] = useState(false);

  const totalBoost = BigInt(post.totalBoost);

  async function handleBoost() {
    setBoosting(true);
    try {
      const challenge = await getPowChallenge();
      setPowChallenge(challenge);
    } catch {
      setBoosting(false);
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    try {
      await boostPost({ data: { postId: post.id, pow: solution } });
      onBoostComplete?.();
    } catch {
      // ignore
    } finally {
      setBoosting(false);
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    setBoosting(false);
  }

  async function toggleBoosters() {
    if (showBoosters) {
      setShowBoosters(false);
      return;
    }
    if (!boosters) {
      setLoadingBoosters(true);
      try {
        const result = await getPostBoosters({ data: { postId: post.id } });
        setBoosters(result);
      } catch {
        setBoosters([]);
      } finally {
        setLoadingBoosters(false);
      }
    }
    setShowBoosters(true);
  }

  return (
    <div className="border-border/30 border-b px-4 py-4">
      <div className="mb-1 flex items-center justify-between">
        <a
          href={`/${post.senderAddress}`}
          className="text-accent hover:text-accent/80 text-sm font-medium no-underline"
        >
          {post.senderAddress}
        </a>
        <span className="text-muted-foreground text-xs">
          {new Date(post.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <PostContent text={post.content} />
      <div className="mt-2 flex items-center gap-4">
        <PowBadge difficulty={BigInt(post.difficulty)} />
        <button
          onClick={handleBoost}
          disabled={boosting}
          className="text-muted-foreground hover:text-accent inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5" />
          Boost
        </button>
        {totalBoost > 0n && (
          <button
            onClick={toggleBoosters}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            <Zap className="text-accent h-3.5 w-3.5" />
            {formatNumber(totalBoost)} boosted
            {showBoosters ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {showBoosters && (
        <div className="mt-2 pl-6">
          {loadingBoosters && (
            <p className="text-muted-foreground text-xs">Loading...</p>
          )}
          {boosters?.map((b) => (
            <div
              key={b.senderAddress}
              className="text-muted-foreground flex items-center justify-between py-0.5 text-xs"
            >
              <a
                href={`/${b.senderAddress}`}
                className="text-accent hover:text-accent/80 no-underline"
              >
                {b.senderAddress}
              </a>
              <PowBadge difficulty={BigInt(b.total)} />
            </div>
          ))}
          {boosters?.length === 0 && (
            <p className="text-muted-foreground text-xs">No boosters yet.</p>
          )}
        </div>
      )}

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
