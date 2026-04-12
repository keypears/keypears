+++
status = "closed"
closed = "2026-04-11"
opened = "2026-04-11"
+++

# Blog at keypears.com/blog

## Goal

Import the blog from kp1 into the new webapp, render it at `/blog` with the same
design patterns as the docs pages, generate RSS/Atom/JSON feeds, and write a new
blog post announcing the rewrite and imminent launch.

## Background

The kp1 codebase has 14 blog posts in `kp1/web-kp/markdown/blog/` with TOML
frontmatter (`+++` delimiters). A `build-blog.ts` script uses the `feed` npm
package, `gray-matter` (with TOML engine), and `remark` to parse the markdown,
generate HTML, and produce three feed formats (RSS, Atom, JSON Feed) written to
`public/blog/`.

The new webapp already has the infrastructure for rendering markdown content:

- `MarkdownRenderer` component with GFM and client-side link navigation
- The `_docs` layout pattern (custom sidebar, burger menu, optional auth)
- The `DocsContent` component pattern (title, content, prev/next)
- Raw markdown imports via `?raw` Vite suffix

### Blog post format

```
+++
title = "Post Title"
date = "2025-10-03T06:00:00-05:00"
author = "Ryan X. Charles"
+++

Markdown content here...
```

14 existing posts from 2025-10-03 to 2025-12-21, all by "Ryan X. Charles".

### Feed generation

The `build-blog.ts` script in kp1 uses:

- `feed` npm package for RSS 2.0, Atom 1.0, and JSON Feed 1.0 generation
- `gray-matter` with TOML engine for frontmatter parsing
- `remark` + `remark-rehype` + `rehype-stringify` for markdown → HTML conversion
- Output to `public/blog/feed.xml`, `public/blog/atom.xml`,
  `public/blog/feed.json`

### Content to create

**New blog post:** "The KeyPears Rewrite" — covering the complete rewrite from
kp1 (React Router, PostgreSQL, Catppuccin) to the current stack (TanStack Start,
MySQL, Tokyo Night). Topics:

- Why we rewrote: TanStack Start for SSR + SPA, MySQL for PlanetScale/Vitess,
  simplified architecture
- What changed: new KDF (BLAKE3 everywhere, ACB3 instead of ACS2), new PoW
  (WebGPU), pull-model federation, vault versioning
- The whitepaper: "KeyPears: Federated Secret Exchange" — published at
  keypears.com/keypears.pdf
- Documentation at /docs — fully integrated into the app
- What's next: launch

### Route structure

```
webapp/src/routes/
  _blog.tsx                      # blog layout (sidebar with post list, optional auth)
  _blog/
    blog.index.tsx               # /blog — blog index (list of all posts)
    blog.$slug.tsx               # /blog/:slug — individual blog post
```

The blog uses the same pattern as docs: a `_blog` layout route outside `_app`
and `_saved` (accessible without login), with its own sidebar listing posts by
date, burger menu on mobile, and fixed sidebar on desktop.

### Blog sidebar

- Logo + "KeyPears" at the top (links to `/`)
- "Home" link
- "Blog" header
- List of posts by title, most recent first
- Active post highlighted

### URL preservation

All existing URLs from kp1 must be preserved exactly. The blog has been live
at `keypears.com/blog/*` and these URLs may be indexed by search engines,
shared on social media, or bookmarked by users. Breaking them would lose
inbound links and damage SEO.

Preserved URLs:

- `/blog` — blog index
- `/blog/2025-10-03-introducing-keypears` — individual posts (slug from filename)
- `/blog/feed.xml` — RSS 2.0 feed
- `/blog/atom.xml` — Atom 1.0 feed
- `/blog/feed.json` — JSON Feed 1.0

The slug is the filename without the `.md` extension (e.g.,
`2025-12-21-sender-verification.md` → `/blog/2025-12-21-sender-verification`).

### Feed build

Adapt `build-blog.ts` from kp1 into `webapp/build-blog.ts`. Run as part of the
build process:
`"build": "bun run build:whitepaper && bun run build:blog && vite build"`. Feeds
are written to `webapp/public/blog/` and served as static files.

---

## Experiment 1: Import blog and render at /blog

### Hypothesis

The 14 existing blog posts can be imported from kp1, rendered at `/blog` using
the same layout pattern as the docs pages, and the feed generation script can
be adapted to run as part of the build. All existing URLs are preserved.

### Changes

**1. Copy blog content.**

Copy all 14 markdown files from `kp1/web-kp/markdown/blog/` to
`webapp/src/blog/`. These files use TOML frontmatter (`+++` delimiters) with
`title`, `date`, and `author` fields.

**2. Create a blog post loader.**

Create `webapp/src/lib/blog.ts` with functions to:

- Parse TOML frontmatter from blog markdown files (using `gray-matter` with
  TOML engine, already used in kp1)
- Return a list of posts sorted by date (most recent first) with slug, title,
  date, and author
- Return a single post by slug with its content

Since we import markdown via `?raw`, the loader will import all blog files
eagerly using `import.meta.glob` and parse them at runtime. This avoids
creating a separate route file for each of the 14 posts.

**3. Create blog layout (`_blog.tsx`).**

Following the docs/channel pattern: top-level layout route outside `_app` and
`_saved`. Builds its own sidebar with:

- Logo + "KeyPears" at the top (links to `/`)
- "Home" link
- "Blog" section header
- List of all posts by title, most recent first, active post highlighted
- Burger menu on mobile, fixed sidebar on desktop
- Optional auth (user dropdown if logged in)
- Astrohacker footer

**4. Create blog index (`_blog/blog.index.tsx`).**

Route: `/blog`. Shows a list of all posts with title, date, and a short
excerpt. Each links to `/blog/:slug`.

**5. Create blog post route (`_blog/blog.$slug.tsx`).**

Route: `/blog/:slug`. Loads the matching markdown file by slug, parses
frontmatter, renders with `MarkdownRenderer`. Shows title, date, author at
top. Prev/next navigation at bottom.

**6. Adapt feed generation script.**

Copy `kp1/web-kp/build-blog.ts` to `webapp/build-blog.ts`. Update paths:

- Read from `src/blog/` instead of `markdown/blog/`
- Write to `public/blog/` (same as kp1)
- Add `feed`, `gray-matter`, `toml`, `remark`, `remark-parse`,
  `remark-frontmatter`, `remark-rehype`, `rehype-stringify` as dependencies
  (check which are already installed)

Add `"build:blog": "bun build-blog.ts"` to `webapp/package.json` scripts.
Update the `build` script to run `build:blog` before `vite build`.

**7. Add "Blog" to main app sidebar.**

Add `{ name: "Blog", path: "/blog", icon: Newspaper }` to the `navItems`
array in `Sidebar.tsx`.

**8. Add "Blog" link to Footer.**

Add "Blog" to the footer links: "Terms · Privacy · Docs · Blog".

### Pass criteria

- All 14 blog posts render at their original URLs (`/blog/:slug`).
- `/blog` shows a list of all posts.
- Blog sidebar lists all posts with active highlighting.
- Feed files are generated at `/blog/feed.xml`, `/blog/atom.xml`,
  `/blog/feed.json`.
- "Blog" appears in the main app sidebar.
- Footer shows "Terms · Privacy · Docs · Blog".
- Tests and linter pass.

### Result: Pass

All 14 blog posts were imported from kp1 and render at their original URLs.
The blog index at `/blog` lists all posts. The blog layout has a sidebar with
post list and active highlighting. Feed files are generated at
`/blog/feed.xml`, `/blog/atom.xml`, and `/blog/feed.json`. "Blog" was added
to the main app sidebar and footer. A new blog post, "The KeyPears Rewrite",
was written and published. The navbar and footer were unified across all
layouts (blog, docs, and main app). Linter passes with 0 warnings and 0 errors.

## Experiment 2: Write "The KeyPears Rewrite" blog post

This was folded into the Experiment 1 implementation. The blog post was written
at `webapp/src/blog/2026-04-11-the-keypears-rewrite.md` covering the complete
rewrite from kp1 to the current stack, including the new KDF, PoW, federation
model, and documentation.

### Result: Pass

Post renders at `/blog/2026-04-11-the-keypears-rewrite` and appears in the
blog index and sidebar.

## Conclusion

The blog from kp1 was successfully imported into the new webapp. All 14
existing blog posts render at their original URLs, preserving SEO and
external links. A new blog post, "The KeyPears Rewrite", was added announcing
the rewrite and upcoming launch. RSS, Atom, and JSON Feed files are generated
as part of the build process. The blog uses a dedicated `_blog` layout with
its own sidebar, following the same pattern as the docs pages. The navbar and
footer were unified across the blog, docs, and main app layouts so all pages
share the same navigation. Key commits: `1be9fcbc` (import blog), `ad227b31`
(rewrite post), `aaf95558` (unify navbar/footer).
