import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { MarkdownPage } from "~/components/MarkdownPage";
import { Footer } from "~/components/Footer";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const loadTerms = createServerFn({ method: "GET" }).handler(async () => {
  const filePath = path.join(process.cwd(), "markdown", "terms.md");
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content } = matter(raw, { delimiters: "+++" });
  return content;
});

export const Route = createFileRoute("/terms")({
  ssr: false,
  loader: () => loadTerms(),
  component: TermsPage,
});

function TermsPage() {
  const content = Route.useLoaderData();
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <MarkdownPage content={content} />
      <Footer />
    </div>
  );
}
