# Guide for AI Agents Working on KeyPears

The KeyPears project is a new secret manager designed to solve the following
problems:

- Allow local-first password management with synchronization across devices.
  Synchronization is handled by a permissionless marketplace of third-party
  service providers using a common protocol, similar to email. The protocol and
  most software is open-source, and anyone can run a KeyPears node for free.
- Allow sharing secrets user-to-user with end-to-end encryption. The fundamental
  idea is that user `alice@example.com` has a public/private key pair, and
  `bob@example2.com` has another public/private key pair. Using Diffie-Hellman
  key exchange, Alice and Bob can derive a shared secret that only they know.
  This shared secret is then used to encrypt/decrypt the shared password. The
  network architecture is very similar to email, except it has a
  cryptography-first design where users must have their own key pairs to share
  secrets.

## Intended Users

Although long-term we want KeyPears to be used by anyone, the primary initial
users fall into two categories:

- Cryptocurrency users who want self-custody of their passwords and secrets,
  including cryptocurrency wallet keys. In the future, we may even add
  first-class support for cryptocurrency wallets directly in KeyPears.
- Business users who need to share secrets securely among team members and who
  do not have a company Bitwarden or 1Password account. KeyPears allows them to
  run their own node completely for free, similar in principle to email. They
  can also sign up for the free tier of `keypears.com`.

## Intended Secrets

KeyPears may be called a "password manager," but the idea is to go further than
just passwords. We intend to provide first-class support for:

- Passwords
- Cryptocurrency wallet keys
- API keys
- Environment variables such as database connection strings
- SSH keys
- PGP keys

KeyPears may also be called a "secret manager" or "credential manager" or "key
manager" or "password vault" or "password safe" or "digital vault."

## Intended Platforms

Near-term, the plan is to provide a Tauri-based native app on the following
platforms:

- Windows
- MacOS
- Linux
- Android
- iOS

We may also create a webapp for secret management. However, for now, the webapp
is intended to be a landing page, blog, and API server, but with no secret
management features. Users will be expected to download the Tauri app to manage
their secrets.

## Project Structure

At this time, there are three projects:

- `@keypears/lib`: The core library that implements the data structures,
  cryptography.
- `@keypears/tauri`: A cross-platform application that works on Mac, Windows,
  Linux, Android, and iOS. It has a mobile-first design, but also supports
  desktop-only features such as system tray icon. This is the primary end-user
  facing application and it is built with Tauri and React Router.
- `@keypears/webapp`: This is the webapp hosted at `keypears.com` and it also
  serves as a template for service providers who want to run a KeyPears node.

Note that the project is very early in its development and will likely change in
structure with time.

### Development Workflow for TypeScript Projects

When making changes to any TypeScript project (`@keypears/lib`, `@keypears/webapp`,
or `@keypears/tauri`), always run the following commands in order from the
respective project directory:

1. `pnpm run lint` - Lint the code with ESLint
2. `pnpm run typecheck` - Type check the TypeScript code
3. `pnpm run test` - Run tests with Vitest
4. `pnpm run build` - Build the package/application

All commands must pass without errors before committing changes. This ensures
code quality and prevents breaking changes from being introduced. These commands
must be run for every TypeScript project in the monorepo.

## Folder Layout

At the top level, the repository has the following folders:

- `lib`: The source code for `@keypears/lib`.
- `tauri`: The source code for `@keypears/tauri`.
- `webapp`: The source code for `@keypears/webapp`.

All projects are managed with `pnpm` and share a common pnpm workspace. The pnpm
workspace file is `pnpm-workspace.yaml`. Most likely, more projects will be
added with time. For instance, it is likely we will create a package for the API
client.

## Programming Languages

The project is primarily written in TypeScript with some Rust code in the Tauri
application. We use node.js as the TypeScript runtime.

### TypeScript Patterns

We have some principles for how we write all TypeScript code throughout the
entire monorepo:

- Always use `prettier` for code formatting.
- Always use `eslint` for linting.
- Always use `typescript` for type checking.
- Always use `vitest` for unit testing.
- Always use `orpc` for the API.
- Always use `zod` for data validation and parsing. Zod schemas are also used in
  the orpc API definitions.
- Always use `WebBuf` and associated tools like `FixedBuf` for binary data. The
  corresponding `npm` packages are `@webbuf/webbuf` and `@webbuf/fixedbuf`.
- Always use `shadcn` for components. There is a catppuccin-esque theme defined
  in the `css` files for shadcn.
- Always use `lucide-react` for icons. Never hard-code SVG icons inline in
  components. Import icons from `lucide-react` (e.g., `import { Copy, Check }
  from "lucide-react"`) and use them as React components with appropriate size
  props.

### Rust Patterns

- Never use `unwrap` without proper handling of error-cases immediately before.
- Never use unsafe code.
- Always use `cargo fmt` to format code before committing.
- Always use `cargo clippy` to lint code before committing.

## Cryptography

KeyPears uses a cross-platform cryptography stack built on WebBuf, a toolkit
that provides Rust implementations of cryptographic primitives compiled to WASM.
This approach ensures identical behavior across Node.js, browsers, mobile
webviews, and native platforms.

### Algorithms

- **Hashing/KDF**: Blake3 - Modern, fast, and secure hash function
- **Encryption**: ACB3 - AES-256-CBC + Blake3-MAC (Encrypt-then-MAC construction)
- **Key Size**: 256-bit (32-byte) keys throughout
- **Password KDF**: Three-tier Blake3-based KDF with 100k rounds per tier:
  - Password Key: Derived from master password, cached on device (encrypted with PIN)
  - Encryption Key: Derived from password key, encrypts the master vault key
  - Login Key: Derived from password key, used for server authentication

ACB3 uses AES-256-CBC rather than AES-GCM because CBC+MAC is simpler to
implement correctly in WASM while providing equivalent security. The
Encrypt-then-MAC pattern prevents padding oracle attacks. AES-256 benefits from
hardware acceleration (AES-NI) on most platforms.

### Design Rationale

- **Cross-platform consistency**: WASM ensures the same code runs everywhere,
  avoiding platform-specific crypto API fragmentation
- **Performance**: Blake3 and WASM provide excellent speed across all platforms
- **Security**: Strong password requirements (16+ lowercase chars = ~75 bits
  entropy) combined with computational hardness provides adequate protection
- **Maintainability**: Single implementation reduces bugs and maintenance burden
- **Modern primitives**: Blake3 is a well-vetted, modern cryptographic primitive

The KDF is not memory-hard like Argon2, but this is an acceptable trade-off
given the strong password requirements and cross-platform constraints. The
threat model assumes high-entropy user passwords rather than defending against
large-scale offline attacks on weak passwords.

### Password Policy

KeyPears uses a distinctive password policy optimized for usability and security:

- **Minimum length**: 16 characters
- **Default character set**: Lowercase letters only (a-z)
- **Entropy**: 16 lowercase characters = ~75 bits of entropy (log₂(26¹⁶) ≈ 75.4
  bits)
- **Optional character sets**: Uppercase, numbers, and symbols can be enabled
  for systems that require them

**Rationale for lowercase-only default:**

1. **Mobile usability**: Lowercase letters are the easiest to type on mobile
   keyboards without switching character modes
2. **Memorability**: Longer passwords with simple characters are easier to
   remember than shorter passwords with complex character requirements
3. **Sufficient entropy**: 75 bits of entropy exceeds the security threshold
   for most threat models (typically 64-80 bits is considered strong)
4. **User experience**: Reduces friction during login, especially on mobile
   devices where the majority of users access their passwords

The `generateSecurePassword` function in `@keypears/lib` supports all character
sets but defaults to lowercase-only. Users can enable uppercase, numbers, and
symbols when needed for legacy systems with strict password policies.

## Icons

Both `webapp` and `tauri` have a `raw-icons/` folder containing source PNG
files. Running `pnpm run build:icons` generates multiple sizes and formats to
`public/images/` and auto-generates `app/util/aicons.ts` with type-safe icon
paths.

All icons are generated at 3x the display size to ensure crisp rendering on
Retina and high-DPI displays (e.g., 100×100px display → 300×300px image).
Images are output as WebP (primary), PNG (compatibility), and ICO (favicon).

The `$aicon()` helper provides compile-time type safety for icon paths,
preventing typos and enabling IDE autocomplete.

## Style

All apps are mobile-first apps, meaning they are designed with one primary
column, unless explicitly specified otherwise. For all colors, we use
catppuccin-based themes, with all the colors hard-coded in the relevant `css`
files. We use `shadcn` components for all UI elements. We support dark mode and
light mode. Dark mode uses catppuccin-mocha and light mode uses
catppuccin-latte.

For typography, we use the `@tailwindcss/typography` plugin, which provides
beautiful default styling for prose content (e.g., blog posts). The design
emphasizes clean typography, generous whitespace, and subtle color accents.

Common styling patterns:

- Container max-widths: `max-w-2xl` for narrow content, `max-w-3xl` for blog
  posts
- Cards: `rounded-lg border border-border bg-card p-6`
- Links: Always use primary green color with animated hover effect. Links have no
  underline by default but show underline on hover. Use `var(--color-primary)` in
  CSS or `text-primary hover:underline` in Tailwind. Add smooth opacity transition
  on hover: `transition: opacity 0.2s` and `opacity: 0.8` on hover state (or
  `hover:opacity-80 transition-opacity` in Tailwind)
- Prose content: Use `keypears-prose` class for all markdown/prose content,
  which extends `@tailwindcss/typography` with brand colors
- Metadata text: `text-muted-foreground`
- Spacing: Use `space-y-4` or `space-y-6` for vertical spacing between elements

## Blog

The webapp includes a blog system located in `webapp/docs/blog`. Blog posts are
written in Markdown with TOML front-matter.

### Blog Structure

- **Blog posts**: `webapp/docs/blog/*.md` - Markdown files with TOML
  front-matter
- **Blog utilities**: `webapp/app/util/blog.ts` - Shared functions for loading
  and parsing blog posts
- **Blog components**: `webapp/app/components/blog-post-card.tsx` - Reusable
  blog post card component
- **Blog routes**:
  - `webapp/app/routes/blog._index.tsx` - All blog posts page
  - `webapp/app/routes/blog.$slug.tsx` - Individual blog post page
- **Feed generation**: `webapp/build-blog.ts` - Script to generate RSS, Atom,
  and JSON feeds
- **Feed output**: `webapp/public/blog/` - Generated feed files (feed.xml,
  atom.xml, feed.json)

### Blog Post Format

All blog posts are located in `webapp/docs/blog/` and follow strict formatting
conventions:

**Filename Format:**
- Pattern: `YYYY-MM-DD-slug.md`
- Example: `2025-10-04-drizzle-sqlite-tauri.md`
- The slug should be short and URL-friendly (lowercase, hyphens only)
- The full filename (including date) appears in the blog post URL

**Front Matter:**
- Blog posts use TOML front-matter delimited by `+++`
- Required fields: `title`, `date`, `author`
- The `date` must match the date in the filename
- Example:

```markdown
+++
title = "Post Title"
date = "2025-10-04"
author = "KeyPears Team"
+++

Post content in Markdown...
```

**Important Rules:**
- **Never** include the title as an `# H1` heading in the blog post content
- The title is automatically rendered from the front-matter
- Start your content with `## H2` headings or regular paragraphs
- Use standard Markdown for all content formatting

### Building the Blog

- Run `pnpm run build:blog` from the `webapp` directory to generate RSS, Atom,
  and JSON feeds
- Blog posts are loaded dynamically by the webapp routes using the shared
  utilities
- The build script uses `remark` and `rehype` to convert Markdown to HTML
- Feed links are included in the homepage meta tags

## Database

KeyPears uses two different database systems depending on the platform:

- **Tauri app (clients)**: SQLite with Drizzle ORM
- **Webapp (servers)**: PostgreSQL with Drizzle ORM

Both databases follow these conventions:

- **Primary Keys**: All tables use ULID (Universally Unique Lexicographically
  Sortable Identifier) for primary keys, unless explicitly specified otherwise
- **ID Type**: ULIDs are stored as `text` in SQLite and `text` or `varchar` in
  PostgreSQL
- **ID Generation**: ULIDs are auto-generated using the `ulid` npm package via
  Drizzle's `.$defaultFn(() => ulid())` pattern

**Why ULID?**
- Time-ordered: ULIDs are lexicographically sortable by creation time
- Collision-resistant: 128-bit random component ensures uniqueness across
  distributed systems
- URL-safe: Base32 encoding works in all contexts
- Better than UUID: ULIDs maintain sort order, making database indexes more
  efficient

**Example schema:**
```typescript
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

export const vaults = sqliteTable("vaults", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  name: text("name").notNull(),
});
```

## Synchronization

Clients use a SQLite database that can contain multiple "vaults". Each vault is
an append-only log of changes plus encrypted secrets. Each vault has an
immutable 256-bit master key that encrypts all secrets. The master key is
encrypted with a key derived from the user's password (see Key Management
section for details on the three-tier key derivation system). Sync nodes
(servers like keypears.com) use PostgreSQL, not SQLite.

### Change Tracking

- Each vault maintains an append-only log of changes (git-like immutability)
- Each change ("diff") is identified by a ULID and references the secret's ULID
- Diffs include timestamps and originating device metadata
- Deletions are soft deletes (tombstones), never actually removed
- Metadata is unencrypted for indexing; only secrets are encrypted
- No compaction needed (password-scale data remains small)

### Conflict Resolution

- Last-write-wins (LWW) based on timestamps
- Users receive notifications when secrets are updated, including which device
  made the change
- Clock skew is not a concern (modern devices sync to time servers)

### Sync Protocol

- New devices download the entire change history on initial sync
- Servers are dumb coordinators that store encrypted diffs
- All sync intelligence lives in clients
- Users can self-host servers (email-like model)

### Key Management

KeyPears uses a three-tier key derivation system that separates authentication
from encryption:

1. **Password Key**: Derived from user's master password with 100k rounds of
   Blake3 PBKDF. Cached on device encrypted with PIN for quick unlock. Never
   sent to server or used directly for encryption.

2. **Encryption Key**: Derived from password key with 100k rounds. Used to
   encrypt/decrypt the master vault key. Never leaves the device.

3. **Login Key**: Derived from password key with 100k rounds. Sent to server
   for authentication. Server compromise cannot reveal password key or
   encryption key due to computational hardness (100k rounds).

**Vault Key Management:**
- Master vault key is immutable (randomly generated 256-bit key)
- Master vault key is encrypted with encryption key (not directly with password)
- User password can be changed (re-derives all three keys, re-encrypts master vault key)
- Master vault key rotation requires creating a new vault and migrating secrets

See `docs/key-derivation.md` for detailed cryptographic specifications.

## Company

KeyPears is an Apache 2.0-licensed project created by Identellica LLC.
Identellica is a pseudonymous identity verification service with a need for
secure secret management and sharing.

## Concluding Thoughts

KeyPears is a new type of password manager designed for full self-custody of
passwords and other secrets while simultaneously solving the problem of
synchronization and sharing. The basic idea is to invent a crypto-first protocol
similar in architecture to email, but based on end-to-end asymmetric
cryptography so that users can share secrets securely.
