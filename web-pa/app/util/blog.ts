import fs from "fs";
import path from "path";
import matter from "gray-matter";
import toml from "toml";

export interface BlogPost {
  slug: string;
  title: string;
  date: Date;
  author: string;
  content: string;
}

interface BlogFrontmatter {
  title: string;
  date: string | Date;
  author: string;
}

export async function loadBlogPosts(): Promise<BlogPost[]> {
  const BLOG_DIR = path.resolve(process.cwd(), "markdown/blog");

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

    // Parse date (handles ISO 8601 with timezone)
    const date = new Date(frontmatter.date);

    posts.push({
      slug,
      title: frontmatter.title,
      date,
      author: frontmatter.author,
      content,
    });
  }

  return posts;
}

export async function loadBlogPost(slug: string): Promise<BlogPost | null> {
  const BLOG_DIR = path.resolve(process.cwd(), "markdown/blog");
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

  // Parse date (handles ISO 8601 with timezone)
  const date = new Date(frontmatter.date);

  return {
    slug,
    title: frontmatter.title,
    date,
    author: frontmatter.author,
    content,
  };
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(date);
}
