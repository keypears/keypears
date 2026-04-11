import { createFileRoute, Link } from "@tanstack/react-router";
import { getBlogPosts } from "~/server/blog.functions";
import type { BlogPostSummary } from "~/lib/blog";

export const Route = createFileRoute("/_blog/blog/")({
  head: () => ({ meta: [{ title: "Blog — KeyPears" }] }),
  loader: () => getBlogPosts(),
  component: BlogIndex,
});

function BlogIndex() {
  const posts = Route.useLoaderData() as BlogPostSummary[];

  return (
    <>
      <h1 className="text-foreground mb-6 text-3xl font-bold">Blog</h1>
      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="border-border/30 hover:bg-accent/5 rounded border px-5 py-4 no-underline transition-colors"
            >
              <h2 className="text-foreground text-lg font-medium">
                {post.title}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {post.dateStr} · {post.author}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
