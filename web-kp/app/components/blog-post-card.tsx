import { href, Link } from "react-router";
import { formatDate, type BlogPost } from "~/util/blog";

interface BlogPostCardProps {
  post: BlogPost;
  compact?: boolean;
}

export function BlogPostCard({ post, compact = false }: BlogPostCardProps) {
  if (compact) {
    return (
      <div className="space-y-1">
        <Link
          to={href("/blog/:slug", { slug: post.slug })}
          className="text-primary text-lg font-semibold transition-opacity hover:underline hover:opacity-80"
        >
          {post.title}
        </Link>
        <div className="text-muted-foreground text-sm">
          {formatDate(post.date)} · {post.author}
        </div>
      </div>
    );
  }

  return (
    <article className="border-border bg-card rounded-lg border p-6 transition-shadow hover:shadow-md">
      <Link
        to={href("/blog/:slug", { slug: post.slug })}
        className="block space-y-3"
      >
        <h2 className="text-primary text-xl font-semibold transition-opacity hover:underline hover:opacity-80">
          {post.title}
        </h2>
        <div className="text-muted-foreground text-sm">
          {formatDate(post.date)} · {post.author}
        </div>
      </Link>
    </article>
  );
}
