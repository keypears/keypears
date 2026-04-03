import { loadBlogPosts } from "~/util/blog";
import { BlogPostCard } from "~/components/blog-post-card";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import type { Route } from "./+types/blog._index";

export async function loader() {
  const posts = await loadBlogPosts();
  return { posts };
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Blog | KeyPears" },
    { name: "description", content: "KeyPears blog - updates and insights" },
  ];
}

export default function BlogIndex({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Header />

        <div className="mt-8 mb-12">
          <h2 className="text-4xl font-bold">Blog</h2>
          <p className="text-muted-foreground mt-2">
            Updates and insights from the KeyPears team
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="text-muted-foreground">No blog posts yet.</p>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
