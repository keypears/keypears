import fs from "fs";
import path from "path";
import matter from "gray-matter";
import toml from "toml";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

export interface BlogPost {
  slug: string;
  title: string;
  date: Date;
  author: string;
  content: string;
  htmlContent: string;
}

interface BlogFrontmatter {
  title: string;
  date: string | Date;
  author: string;
}

async function parseMarkdown(content: string): Promise<string> {
  const result = await remark()
    .use(remarkParse)
    .use(remarkFrontmatter, ["toml"])
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(content);

  return String(result);
}

export async function loadBlogPosts(): Promise<BlogPost[]> {
  const BLOG_DIR = path.resolve(process.cwd(), "docs/blog");

  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .reverse(); // Most recent first

  const posts: BlogPost[] = [];

  for (const filename of files) {
    const filePath = path.join(BLOG_DIR, filename);
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const { data, content } = matter(fileContent, {
      delimiters: ["+++", "+++"],
      engines: {
        toml: toml.parse.bind(toml),
      },
      language: "toml",
    });

    const frontmatter = data as BlogFrontmatter;

    // Extract slug from filename (remove .md extension)
    const slug = filename.replace(/\.md$/, "");

    // Parse markdown to HTML
    const htmlContent = await parseMarkdown(content);

    posts.push({
      slug,
      title: frontmatter.title,
      date: new Date(frontmatter.date),
      author: frontmatter.author,
      content,
      htmlContent,
    });
  }

  return posts;
}

export async function loadBlogPost(slug: string): Promise<BlogPost | null> {
  const BLOG_DIR = path.resolve(process.cwd(), "docs/blog");
  const filePath = path.join(BLOG_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");

  const { data, content } = matter(fileContent, {
    delimiters: ["+++", "+++"],
    engines: {
      toml: toml.parse.bind(toml),
    },
    language: "toml",
  });

  const frontmatter = data as BlogFrontmatter;

  // Parse markdown to HTML
  const htmlContent = await parseMarkdown(content);

  return {
    slug,
    title: frontmatter.title,
    date: new Date(frontmatter.date),
    author: frontmatter.author,
    content,
    htmlContent,
  };
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
