import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { createPost, getFeed, getPostPowChallenge } from "~/server/post.functions";
import { PowModal } from "~/components/PowModal";
import { PostCard } from "~/components/PostCard";
import { PostContent } from "~/components/PostContent";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { Send as SendIcon } from "lucide-react";

const MAX_LENGTH = 240;

function normalizeText(s: string): string {
  return s.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ");
}

export const Route = createFileRoute("/_app/_saved/_chrome/feed")({
  head: () => ({ meta: [{ title: "Feed — KeyPears" }] }),
  loader: () => getFeed({ data: {} }),
  component: FeedPage,
});

function FeedPage() {
  const initialPosts = Route.useLoaderData();
  const [postList, setPostList] = useState(initialPosts);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20);
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  const normalized = normalizeText(text);
  const charsLeft = MAX_LENGTH - normalized.length;
  const overLimit = charsLeft < 0;

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!normalized.trim() || overLimit) return;
    setError("");
    setPosting(true);

    try {
      // Get a PoW challenge (no sender auth needed for posts — just use
      // the simple registration-style challenge)
      const challenge = await getPostPowChallenge();
      setPowChallenge(challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create post.");
      setPosting(false);
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    try {
      await createPost({ data: { content: normalized.trim(), pow: solution } });
      setText("");
      // Refresh feed
      const updated = await getFeed({ data: {} });
      setPostList(updated);
      setHasMore(updated.length >= 20);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create post.");
    } finally {
      setPosting(false);
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    setPosting(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || postList.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getFeed({
        data: { beforeId: postList[postList.length - 1].id },
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
      {/* Compose */}
      <form
        onSubmit={handlePost}
        className="border-border/30 border-b px-4 py-4"
      >
        <input
          type="text"
          placeholder="What's on your mind?"
          value={text}
          onChange={(e) => setText(normalizeText(e.target.value))}
          className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 text-sm"
        />
        {normalized.trim() && (
          <div className="border-border/30 mt-2 rounded border px-3 py-2">
            <PostContent text={normalized.trim()} />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}
          >
            {charsLeft}
          </span>
          {error && <p className="text-danger text-xs">{error}</p>}
          <button
            type="submit"
            disabled={posting || !normalized.trim() || overLimit}
            className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center gap-2 rounded px-4 py-1.5 text-sm transition-all disabled:opacity-50"
          >
            <SendIcon className="h-4 w-4" />
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </form>

      {/* Feed */}
      {postList.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          No posts yet. Be the first to post!
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

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
