import { loadBlogPosts } from "~/util/blog";
import { BlogPostCard } from "~/components/blog-post-card";
import type { Route } from "./+types/blog._index";

export async function loader() {
  const posts = await loadBlogPosts();
  return { posts };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Blog | KeyPears" },
    { name: "description", content: "KeyPears blog - updates and insights" },
  ];
}

export default function BlogIndex({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-12">
          <h1 className="text-4xl font-bold">Blog</h1>
          <p className="mt-2 text-muted-foreground">
            Updates and insights from the KeyPears team
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-muted-foreground">No blog posts yet.</p>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
