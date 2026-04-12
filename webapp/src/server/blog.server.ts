import matter from "gray-matter";
import toml from "toml";
import type { BlogPost, BlogPostSummary } from "~/lib/blog";

// Inline every blog markdown file at build time via Vite's ?raw glob.
// This is the same pattern docs/*.md use, and it avoids depending on
// `webapp/src/blog/*.md` existing on disk at runtime — those files are
// not copied into `dist/` by the vite build, so reading them with
// `fs.readdirSync` works in dev (where the source tree is live) but
// fails in production with ENOENT.
const blogModules = import.meta.glob<string>("../blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function parseFrontmatter(raw: string) {
  const { data, content } = matter(raw, {
    delimiters: ["+++", "+++"],
    engines: { toml: toml.parse.bind(toml) },
    language: "toml",
  });
  return {
    data: data as { title: string; date: string; author: string },
    content,
  };
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

  const posts: BlogPost[] = [];
  for (const [filepath, raw] of Object.entries(blogModules)) {
    const filename = filepath.split("/").pop()!;
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

  // Sort newest first by the frontmatter `date` (full ISO timestamp,
  // minute-resolution). Tiebreak on slug so two posts with the exact
  // same timestamp still get a stable order. Filename is no longer the
  // sort key — only the frontmatter date matters, so two posts on the
  // same day will order correctly as long as their `date` fields differ.
  posts.sort((a, b) => {
    const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
    return diff !== 0 ? diff : b.slug.localeCompare(a.slug);
  });

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
    prev:
      idx < posts.length - 1
        ? { slug: posts[idx + 1]!.slug, title: posts[idx + 1]!.title }
        : null,
    next:
      idx > 0
        ? { slug: posts[idx - 1]!.slug, title: posts[idx - 1]!.title }
        : null,
  };
}
