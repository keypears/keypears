import { Link } from "react-router";
import { loadBlogPosts } from "~/util/blog";
import { BlogPostCard } from "~/components/blog-post-card";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "KeyPears" },
    { name: "description", content: "Welcome to KeyPears!" },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/rss+xml",
      title: "KeyPears Blog RSS Feed",
      href: "/blog/feed.xml",
    },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/atom+xml",
      title: "KeyPears Blog Atom Feed",
      href: "/blog/atom.xml",
    },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/json",
      title: "KeyPears Blog JSON Feed",
      href: "/blog/feed.json",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const allPosts = await loadBlogPosts();
  const recentPosts = allPosts.slice(0, 10);
  return { message: context.VALUE_FROM_EXPRESS, recentPosts };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { recentPosts } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Header />

        {recentPosts.length > 0 && (
          <section className="mt-16">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Recent Posts</h2>
              <Link
                to="/blog"
                className="text-sm text-primary hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-6">
              {recentPosts.map((post) => (
                <BlogPostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        )}

        <Footer />
      </div>
    </div>
  );
}
