import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Feed } from "feed";
import matter from "gray-matter";
import toml from "toml";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

// Convert import.meta.url to __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BlogPost {
  slug: string;
  filename: string;
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

const BLOG_DIR = path.resolve(__dirname, "docs/blog");
const OUTPUT_DIR = path.resolve(__dirname, "public/blog");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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

async function loadBlogPosts(): Promise<BlogPost[]> {
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
      filename,
      title: frontmatter.title,
      date: new Date(frontmatter.date),
      author: frontmatter.author,
      content,
      htmlContent,
    });
  }

  return posts;
}

function generateFeeds(posts: BlogPost[]): void {
  const siteUrl = "https://keypears.com";
  const feedUrl = `${siteUrl}/blog`;

  const feed = new Feed({
    title: "KeyPears Blog",
    description: "Updates and insights from the KeyPears team",
    id: siteUrl,
    link: siteUrl,
    language: "en",
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `Copyright ${new Date().getFullYear()} Identellica LLC`,
    feedLinks: {
      rss: `${siteUrl}/blog/feed.xml`,
      atom: `${siteUrl}/blog/atom.xml`,
      json: `${siteUrl}/blog/feed.json`,
    },
  });

  // Add posts to feed
  for (const post of posts) {
    feed.addItem({
      title: post.title,
      id: `${feedUrl}/${post.slug}`,
      link: `${feedUrl}/${post.slug}`,
      description: post.htmlContent.substring(0, 200) + "...",
      content: post.htmlContent,
      author: [
        {
          name: post.author,
        },
      ],
      date: post.date,
    });
  }

  // Write feeds to files
  fs.writeFileSync(path.join(OUTPUT_DIR, "feed.xml"), feed.rss2());
  fs.writeFileSync(path.join(OUTPUT_DIR, "atom.xml"), feed.atom1());
  fs.writeFileSync(path.join(OUTPUT_DIR, "feed.json"), feed.json1());

  console.log(`Generated RSS feed at ${OUTPUT_DIR}/feed.xml`);
  console.log(`Generated Atom feed at ${OUTPUT_DIR}/atom.xml`);
  console.log(`Generated JSON feed at ${OUTPUT_DIR}/feed.json`);
}

async function main() {
  console.log("Building blog...");

  const posts = await loadBlogPosts();
  console.log(`Loaded ${posts.length} blog post(s)`);

  generateFeeds(posts);

  console.log("Blog build complete!");
}

main().catch((error) => {
  console.error("Error building blog:", error);
  process.exit(1);
});
