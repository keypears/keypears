+++
status = "open"
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
author = "KeyPears Team"
+++

Markdown content here...
```

14 existing posts from 2025-10-03 to 2025-12-21, all by "KeyPears Team".

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
