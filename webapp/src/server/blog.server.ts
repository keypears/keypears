import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import toml from "toml";
import type { BlogPost, BlogPostSummary } from "~/lib/blog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.resolve(__dirname, "../blog");

function parseFrontmatter(raw: string) {
  const { data, content } = matter(raw, {
    delimiters: ["+++", "+++"],
    engines: { toml: toml.parse.bind(toml) },
    language: "toml",
  });
  return { data: data as { title: string; date: string; author: string }, content };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

let cachedPosts: BlogPost[] | null = null;

function loadAllPosts(): BlogPost[] {
  if (cachedPosts) return cachedPosts;

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file: string) => file.endsWith(".md"))
    .toSorted()
    .toReversed();

  const posts: BlogPost[] = [];
  for (const filename of files) {
    const filePath = path.join(BLOG_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = parseFrontmatter(raw);
    const date = new Date(data.date);
    posts.push({
      slug: filename.replace(/\.md$/, ""),
      title: data.title,
      date: date.toISOString(),
      dateStr: formatDate(date),
      author: data.author,
      content,
    });
  }

  cachedPosts = posts;
  return posts;
}

export function getAllPostSummaries(): BlogPostSummary[] {
  return loadAllPosts().map(({ slug, title, dateStr, author }) => ({
    slug,
    title,
    dateStr,
    author,
  }));
}

export function getPostBySlug(slug: string): BlogPost | null {
  return loadAllPosts().find((p) => p.slug === slug) ?? null;
}

export function getPrevNextPost(slug: string) {
  const posts = loadAllPosts();
  const idx = posts.findIndex((p) => p.slug === slug);
  return {
    prev: idx < posts.length - 1 ? { slug: posts[idx + 1]!.slug, title: posts[idx + 1]!.title } : null,
    next: idx > 0 ? { slug: posts[idx - 1]!.slug, title: posts[idx - 1]!.title } : null,
  };
}
