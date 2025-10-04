import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import type { Route } from "./+types/privacy";
import fs from "fs";
import path from "path";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

async function loadPrivacyContent(): Promise<string> {
  const filePath = path.resolve(process.cwd(), "docs/privacy.md");
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const result = await remark()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(fileContent);

  return String(result);
}

export async function loader() {
  const htmlContent = await loadPrivacyContent();
  return { htmlContent };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy Policy | KeyPears" },
    { name: "description", content: "KeyPears privacy policy" },
  ];
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  const { htmlContent } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Header />

        <article
          className="prose prose-lg dark:prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        <Footer />
      </div>
    </div>
  );
}
