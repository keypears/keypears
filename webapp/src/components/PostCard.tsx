import { PostContent } from "./PostContent";
import { PowBadge } from "./PowBadge";

interface Post {
  id: string;
  senderAddress: string;
  content: string;
  difficulty: string;
  createdAt: Date;
}

export function PostCard({ post }: { post: Post }) {
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
      <div className="mt-2">
        <PowBadge difficulty={BigInt(post.difficulty)} />
      </div>
    </div>
  );
}
