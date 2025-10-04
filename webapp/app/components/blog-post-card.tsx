import { Link } from "react-router";
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
          to={`/blog/${post.slug}`}
          className="text-lg font-semibold text-primary hover:underline hover:opacity-80 transition-opacity"
        >
          {post.title}
        </Link>
        <div className="text-sm text-muted-foreground">
          {formatDate(post.date)} · {post.author}
        </div>
      </div>
    );
  }

  return (
    <article className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md">
      <Link
        to={`/blog/${post.slug}`}
        className="block space-y-3"
      >
        <h2 className="text-xl font-semibold text-primary hover:underline hover:opacity-80 transition-opacity">
          {post.title}
        </h2>
        <div className="text-sm text-muted-foreground">
          {formatDate(post.date)} · {post.author}
        </div>
      </Link>
    </article>
  );
}
