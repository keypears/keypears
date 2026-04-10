import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getProfile } from "~/server/user.functions";
import { getUserPostsByAddress } from "~/server/post.functions";
import { parseAddress } from "~/lib/config";
import { CircleUser, Copy, Check, MessageSquare } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";
import { PostCard } from "~/components/PostCard";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.address} — KeyPears` : "KeyPears" }],
  }),
  loader: async ({ params }) => {
    const parsed = parseAddress(params.profile);
    if (!parsed) throw notFound();

    const [profileData, userPosts] = await Promise.all([
      getProfile({ data: params.profile }),
      getUserPostsByAddress({ data: { address: params.profile } }),
    ]);
    if (!profileData) throw notFound();

    return {
      address: params.profile,
      powTotal: profileData.powTotal,
      posts: userPosts,
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { address, powTotal, posts: initialPosts } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);
  const [postList, setPostList] = useState(initialPosts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || postList.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getUserPostsByAddress({
        data: { address, beforeId: postList[postList.length - 1].id },
      });
      if (older.length < 20) setHasMore(false);
      setPostList((prev) => [...prev, ...older]);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl font-sans">
      <div className="flex flex-col items-center pt-16 pb-6">
        <CircleUser className="text-muted-foreground h-20 w-20" />
        <button
          onClick={handleCopy}
          className="text-foreground hover:text-accent mt-4 inline-flex cursor-pointer items-center gap-2 text-xl font-bold transition-colors"
          title="Copy address"
        >
          {address}
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="text-muted-foreground h-4 w-4" />
          )}
        </button>
        <a
          href={`/send?to=${encodeURIComponent(address)}`}
          className="bg-accent text-accent-foreground hover:bg-accent/90 mt-4 inline-flex items-center gap-2 rounded px-4 py-1.5 text-sm no-underline transition-all"
        >
          <MessageSquare className="h-4 w-4" />
          Message
        </a>
        {BigInt(powTotal) > 0n && (
          <div className="mt-3">
            <PowBadge
              difficulty={BigInt(powTotal)}
              label="total proof-of-work"
            />
          </div>
        )}
      </div>

      {/* User's posts */}
      {postList.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          No posts yet.
        </p>
      ) : (
        <>
          {postList.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-accent hover:text-accent/80 w-full py-4 text-center text-sm disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
