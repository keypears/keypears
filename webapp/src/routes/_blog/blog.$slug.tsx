import { createFileRoute, Link } from "@tanstack/react-router";
import { getBlogPost } from "~/server/blog.functions";
import { MarkdownRenderer } from "~/components/MarkdownRenderer";

export const Route = createFileRoute("/_blog/blog/$slug")({
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.post
          ? `${loaderData.post.title} — KeyPears Blog`
          : "KeyPears Blog",
      },
    ],
  }),
  loader: ({ params }) => getBlogPost({ data: params.slug }),
  component: BlogPost,
});

function BlogPost() {
  const data = Route.useLoaderData();

  if (!data?.post) {
    return (
      <div className="py-12 text-center">
        <p className="text-foreground text-lg font-bold">Post not found</p>
        <Link
          to="/blog"
          className="text-accent hover:text-accent/80 mt-4 inline-block text-sm no-underline"
        >
          Back to blog
        </Link>
      </div>
    );
  }

  const { post, prev, next } = data;

  return (
    <>
      <h1 className="text-foreground mb-2 text-3xl font-bold">{post.title}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {post.dateStr} · {post.author}
      </p>
      <article className="prose-sm prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-a:text-accent prose-code:text-foreground prose-pre:bg-background-dark prose-pre:border-border prose-pre:border prose-li:text-foreground prose-td:text-foreground prose-th:text-foreground prose-th:text-left max-w-none">
        <MarkdownRenderer content={post.content} />
      </article>
      {(prev || next) && (
        <nav className="border-border/30 mt-12 flex justify-between border-t pt-4">
          {prev ? (
            <Link
              to="/blog/$slug"
              params={{ slug: prev.slug }}
              className="text-muted-foreground hover:text-accent max-w-[45%] text-sm no-underline"
            >
              &larr; {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to="/blog/$slug"
              params={{ slug: next.slug }}
              className="text-muted-foreground hover:text-accent max-w-[45%] text-right text-sm no-underline"
            >
              {next.title} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
