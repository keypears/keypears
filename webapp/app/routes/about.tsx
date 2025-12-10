import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import type { Route } from "./+types/about";
import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function loadAboutContent(): string {
  const filePath = path.resolve(process.cwd(), "markdown/about.md");
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return fileContent;
}

export function loader() {
  const content = loadAboutContent();
  return { content };
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "About | KeyPears" },
    { name: "description", content: "Learn about KeyPears and our mission" },
  ];
}

export default function About({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Header />

        <article className="keypears-prose mt-8 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>

        <Footer />
      </div>
    </div>
  );
}
