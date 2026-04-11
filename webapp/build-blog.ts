import fs from "fs";
import path from "path";
import { Feed } from "feed";
import matter from "gray-matter";
import toml from "toml";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

interface BlogPost {
  slug: string;
  title: string;
  date: Date;
  author: string;
  htmlContent: string;
}

const BLOG_DIR = path.resolve(import.meta.dir, "src/blog");
const OUTPUT_DIR = path.resolve(import.meta.dir, "public/blog");

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
    .filter((file: string) => file.endsWith(".md"))
    .toSorted()
    .toReversed();

  const posts: BlogPost[] = [];

  for (const filename of files) {
    const filePath = path.join(BLOG_DIR, filename);
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const { data, content } = matter(fileContent, {
      delimiters: ["+++", "+++"],
      engines: { toml: toml.parse.bind(toml) },
      language: "toml",
    });

    const slug = filename.replace(/\.md$/, "");
    const htmlContent = await parseMarkdown(content);

    posts.push({
      slug,
      title: data.title,
      date: new Date(data.date),
      author: data.author,
      htmlContent,
    });
  }

  return posts;
}

function generateFeeds(posts: BlogPost[]): void {
  const siteUrl = "https://keypears.com";

  const feed = new Feed({
    title: "KeyPears Blog",
    description: "Updates and insights from the KeyPears team",
    id: siteUrl,
    link: siteUrl,
    language: "en",
    favicon: `${siteUrl}/favicon-dark.png`,
    copyright: `Copyright ${new Date().getFullYear()} Identellica LLC`,
    feedLinks: {
      rss: `${siteUrl}/blog/feed.xml`,
      atom: `${siteUrl}/blog/atom.xml`,
      json: `${siteUrl}/blog/feed.json`,
    },
  });

  for (const post of posts) {
    feed.addItem({
      title: post.title,
      id: `${siteUrl}/blog/${post.slug}`,
      link: `${siteUrl}/blog/${post.slug}`,
      description: `${post.htmlContent.substring(0, 200)}...`,
      content: post.htmlContent,
      author: [{ name: post.author }],
      date: post.date,
    });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "feed.xml"), feed.rss2());
  fs.writeFileSync(path.join(OUTPUT_DIR, "atom.xml"), feed.atom1());
  fs.writeFileSync(path.join(OUTPUT_DIR, "feed.json"), feed.json1());

  console.log(`Generated feeds at ${OUTPUT_DIR}/`);
}

async function main() {
  console.log("Building blog feeds...");
  const posts = await loadBlogPosts();
  console.log(`Loaded ${posts.length} blog post(s)`);
  generateFeeds(posts);
  console.log("Blog build complete!");
}

main().catch((error) => {
  console.error("Error building blog:", error);
  process.exit(1);
});
