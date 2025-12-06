import { href, Link } from "react-router";
import { loadBlogPost, formatDate } from "~/util/blog";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Route } from "./+types/blog.$slug";

export async function loader({ params }: Route.LoaderArgs) {
  const post = await loadBlogPost(params.slug);

  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  return { post };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.post) {
    return [{ title: "Blog Post Not Found" }];
  }

  return [
    { title: `${data.post.title} | KeyPears Blog` },
    { name: "description", content: data.post.title },
  ];
}

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const { post } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Header />

        <Link
          to={href("/blog")}
          className="mb-8 mt-8 inline-block text-sm text-primary hover:underline"
        >
          ← Back to blog
        </Link>

        <article className="mb-8 space-y-4">
          <h1 className="text-3xl font-bold md:text-4xl">{post.title}</h1>
          <div className="text-sm text-muted-foreground">
            {formatDate(post.date)} · {post.author}
          </div>
          <hr className="border-border" />
        </article>

        <div className="keypears-prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>

        <Footer />
      </div>
    </div>
  );
}
