import { Link } from "react-router";
import { loadBlogPosts } from "~/util/blog";
import { BlogPostCard } from "~/components/blog-post-card";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import { Button } from "~/components/ui/button";
import { Sparkles } from "lucide-react";
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

        {/* Beta Banner */}
        <section className="mt-12">
          <Link to="/secret">
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-green-500 to-teal-500 p-8 text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] hover:shadow-xl">
              <div className="relative z-10 flex flex-col items-center text-center">
                <Sparkles size={32} className="mb-4" />
                <h2 className="mb-2 text-3xl font-bold">Try the Beta!</h2>
                <p className="mb-6 text-lg opacity-90">
                  Generate secure, easy-to-type passwords with our password
                  generator
                </p>
                <Button
                  size="lg"
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                >
                  Launch Password Generator
                </Button>
              </div>
            </div>
          </Link>
        </section>

        {recentPosts.length > 0 && (
          <section className="mt-16">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Recent Posts</h2>
              <Link
                to="/blog"
                className="text-sm text-primary hover:underline hover:opacity-80 transition-opacity"
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
