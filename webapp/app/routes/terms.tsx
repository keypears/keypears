import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import type { Route } from "./+types/terms";
import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function loadTermsContent(): string {
  const filePath = path.resolve(process.cwd(), "docs/terms.md");
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return fileContent;
}

export function loader() {
  const content = loadTermsContent();
  return { content };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Terms of Service | KeyPears" },
    { name: "description", content: "KeyPears terms of service" },
  ];
}

export default function Terms({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Header />

        <article className="prose prose-lg dark:prose-invert mt-8 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </article>

        <Footer />
      </div>
    </div>
  );
}
