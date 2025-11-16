+++
title = "TypeScript for the KeyPears MVP: Why We're Not Really Using Rust (Yet)"
date = "2025-11-16T06:00:00-06:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager and
cryptocurrency wallet. The design decisions described here represent our
development approach and may evolve before our official release.

Three weeks ago, we published a blog post titled "Building KeyPears with Rust:
Backend Architecture and Blake3 Proof-of-Concept." We were excited about Rust's
performance, memory safety, and type system. We had a working `/api/blake3`
endpoint. We had plans for `rs-lib` and `rs-node` packages.

Today, we're writing to tell you we've changed direction.

The current KeyPears codebase is **almost entirely TypeScript**. The "Rust
backend" from our October post never materialized beyond that single
proof-of-concept endpoint. And after several weeks of development, we've
concluded this is actually the right architecture for our MVP.

This post explains why.

## What Actually Happened

Let's start with the facts. Here's what the KeyPears codebase looks like today:

**Rust code:** 33 lines total

- `tauri-rs/src/lib.rs`: 27 lines (environment configuration + hello world)
- `tauri-rs/src/main.rs`: 6 lines (Tauri app entry point)
- **Zero** cryptography code
- **Zero** API server code
- **Zero** business logic

**TypeScript code:** ~5,400 lines

- `@keypears/lib`: 366 lines (complete cryptography library)
- `@keypears/api-server`: Full orpc-based API with Blake3 endpoint
- `keypears-tauri`: ~5,020 lines (complete vault management UI)
- `@keypears/webapp`: Production web app + integrated API server

The Rust packages mentioned in the October blog post (`rs-lib` for cryptography,
`rs-node` for the API server) don't exist. They were never built. The only Rust
code is the minimal Tauri shell that every Tauri app requires.

## Why We Moved Away from Rust

After publishing that October post, we started implementing the actual features
users need: vault creation, password storage, secret encryption, database
operations, synchronization protocols. And we kept hitting the same wall:
**Rust's ecosystem doesn't have the mature tooling TypeScript has for building
web APIs and database-backed applications.**

Here's what we discovered:

### 1. No Rust Equivalent to orpc

The October post mentioned using Axum with `utoipa` for OpenAPI generation.
Sounds great in theory. In practice:

**The Rust approach:**

1. Define routes in Rust with Axum
2. Generate OpenAPI spec with `utoipa` macros
3. Run `openapi-generator` to create TypeScript client
4. Hope the generated client matches your frontend needs
5. Discover type mismatches at runtime

**The TypeScript approach (orpc):**

```typescript
// Define the procedure
export const blake3Procedure = os
  .input(Blake3RequestSchema)
  .output(Blake3ResponseSchema)
  .handler(async ({ input }) => {
    const data = WebBuf.fromBase64(input.data);
    const hash = blake3Hash(data);
    return { hash: hash.buf.toHex() };
  });

// Use it in the client with full type safety
const client = createClient({ url: "/api" });
const result = await client.blake3({ data: "..." });
// TypeScript knows `result.hash` is a string
```

**Zero codegen. Complete type safety. Instant IDE autocomplete.**

The client knows every endpoint, every parameter type, every response shape.
Change the server? The client errors appear immediately in your IDE. This is
what modern TypeScript can do that Rust fundamentally cannot—share type
information across the network boundary without code generation.

### 2. No Rust ORM Supports Both SQLite and PostgreSQL Well

KeyPears needs two databases:

- **SQLite** in the Tauri desktop app (client-side storage)
- **PostgreSQL** on the server (multi-user vault synchronization)

In TypeScript, **Drizzle ORM** handles both with the same API:

```typescript
// Client (SQLite)
import { drizzle } from "drizzle-orm/sqlite-proxy";
const db = drizzle(/* Tauri SQL plugin */);

// Server (PostgreSQL)
import { drizzle } from "drizzle-orm/node-postgres";
const db = drizzle(/* pg connection */);

// Same schema definition works for both
export const TableVault = sqliteTable("vault", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // ...
});
```

The Rust ecosystem doesn't have this. **Diesel** supports Postgres and MySQL but
has poor SQLite support. **SeaORM** is newer but still requires separate schema
definitions for different databases. Neither provides the unified, type-safe
query builder that Drizzle gives us.

When you're building a sync protocol where the client and server need matching
schemas, having one ORM that works everywhere is critical.

### 3. Development Velocity Matters for an MVP

Hot reload times tell the story:

- **TypeScript (Vite):** ~100ms to see changes
- **Rust (Axum):** ~3-10 seconds to recompile and restart

For a side project where development happens in short evening sessions, this
compounds quickly. Ten changes in an hour means you're waiting 90 seconds total
with TypeScript or 5 minutes with Rust.

Over weeks of development, that's hours of time saved.

### 4. TypeScript Has Better Web-Focused Libraries

Building a modern web application requires:

- Session management
- Request validation
- Middleware chains
- SSR with React
- Type-safe routing
- Testing frameworks

The TypeScript ecosystem has mature solutions for all of these:

- **Zod** for validation (with TypeScript inference)
- **React Router 7** for SSR + client routing
- **Vitest** for fast ESM-native testing
- **orpc** for RPC with end-to-end types

The Rust ecosystem has alternatives, but they're less mature and require more
glue code. We found ourselves constantly translating between Rust idioms and web
development patterns, whereas TypeScript libraries are designed for the web from
the ground up.

## What We Didn't Lose: Rust Cryptography via WASM

Here's the key insight that made this pivot work: **We still use Rust for
cryptography. We just use it through WebAssembly instead of native Rust.**

Our entire crypto stack comes from the `@webbuf` packages:

- **`@webbuf/blake3`**: Blake3 hashing (Rust → WASM)
- **`@webbuf/acb3`**: AES-256-CBC + Blake3-MAC (Rust → WASM)
- **`@webbuf/webbuf`**: Binary data utilities (Rust → WASM)
- **`@webbuf/fixedbuf`**: Fixed-size buffers (Rust → WASM)

These packages compile Rust cryptography to WebAssembly. We get:

✅ **Rust's memory safety** (WASM sandbox) ✅ **Rust's performance**
(near-native speed) ✅ **Cross-platform consistency** (works in Node, browsers,
Tauri) ✅ **TypeScript ergonomics** (native `Uint8Array` integration)

Here's our complete three-tier key derivation system in TypeScript:

```typescript
// 100,000 rounds of Blake3-based PBKDF
export function blake3Pbkdf(
  password: string | WebBuf,
  salt: FixedBuf<32>,
  rounds: number = 100_000,
): FixedBuf<32> {
  const passwordBuf = typeof password === "string"
    ? WebBuf.fromUtf8(password)
    : password;

  let result = blake3Mac(salt, passwordBuf);
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }
  return result;
}

// Derive password key from user's master password
export function derivePasswordKey(password: string): FixedBuf<32> {
  const salt = derivePasswordSalt(password);
  return blake3Pbkdf(password, salt, 100_000);
}

// Derive encryption key (for vault data)
export function deriveEncryptionKey(passwordKey: FixedBuf<32>): FixedBuf<32> {
  const salt = deriveEncryptionSalt();
  return blake3Pbkdf(passwordKey.buf, salt, 100_000);
}

// Derive login key (sent to server)
export function deriveLoginKey(passwordKey: FixedBuf<32>): FixedBuf<32> {
  const salt = deriveLoginSalt();
  return blake3Pbkdf(passwordKey.buf, salt, 100_000);
}
```

This is production-ready cryptography. It's type-safe. It's fast (200,000 Blake3
operations complete in milliseconds). And the actual hashing happens in
Rust-compiled WASM.

**We didn't abandon Rust's security properties. We just stopped writing Rust.**

## The Architecture That Emerged

Here's what the current KeyPears stack looks like:

### Package Structure

```
@keypears/lib (TypeScript)
├── Blake3 hashing via @webbuf/blake3 (Rust→WASM)
├── ACB3 encryption via @webbuf/acb3 (Rust→WASM)
├── Three-tier key derivation (100k rounds each)
├── Password generation with entropy calculation
└── Zod schemas for validation

@keypears/api-server (TypeScript)
├── orpc router with type-safe procedures
├── Blake3 endpoint (working proof-of-concept)
├── Drizzle ORM + PostgreSQL schema (ready for server DB)
└── Client factory for end-to-end type safety

keypears-tauri (TypeScript + Rust shell)
├── Tauri 2.0 app (33 lines of Rust)
├── Full vault management UI (~5,020 lines TypeScript)
├── SQLite with Drizzle ORM
├── React Router 7 for navigation
├── Shadcn components + Catppuccin theme
└── Calls production API server for crypto endpoints

@keypears/webapp (TypeScript)
├── Production website + blog
├── Integrated API server (orpc mounted at /api)
├── Single Express server on port 4273
└── Deployed on AWS Fargate
```

### What Works Today

The Tauri app has a complete vault management workflow:

✅ Create vault with password ✅ Unlock vault with password verification ✅
Store passwords with encryption ✅ Generate secure passwords ✅ SQLite
persistence via Drizzle ✅ Three-tier key derivation working ✅ Vault encryption
with ACB3 ✅ Multi-step wizards (name → password → confirm → success) ✅ Test
page calling production Blake3 API

The webapp has:

✅ Landing page with blog system ✅ Working `/api/blake3` endpoint ✅ orpc
integrated with Express ✅ Docker deployment to AWS Fargate ✅ Canonical URL
redirects ✅ Blog posts with TOML frontmatter + Markdown

### What's Not Built (Intentionally Deferred)

We haven't built server-side features yet because the MVP is **local-first**:

- ⏸️ User authentication (login/logout)
- ⏸️ Vault synchronization protocol
- ⏸️ Multi-user server support
- ⏸️ Diffie-Hellman key exchange across domains
- ⏸️ Public key infrastructure

These are v2 features. The MVP is a password manager that works 100% offline in
the Tauri app. The server is only needed for multi-device sync, which we'll add
after validating the core product.

## The TypeScript Ecosystem Has Caught Up

Five years ago, this blog post would have been different. Rust was the only way
to get type-safe backends with good performance. But the TypeScript ecosystem
has evolved dramatically:

**orpc** gives us end-to-end type safety that Rust can't match (no codegen,
instant IDE feedback)

**Drizzle** provides type-safe SQL for both SQLite and PostgreSQL (no Rust ORM
does this well)

**WASM** lets us use Rust crypto without writing Rust applications (best of both
worlds)

**Vitest** gives us fast ESM-native testing (simpler than Cargo's test framework
for web apps)

**React Router 7** provides SSR + type-safe routing (no Rust equivalent)

For building web applications with cryptography, TypeScript + WASM is now a
better choice than native Rust. You get comparable performance, better tooling,
and a much larger ecosystem of web-focused libraries.

## When Would We Use Rust?

This isn't a rejection of Rust. It's a recognition that **Rust solves the wrong
problems for our MVP.**

Rust makes sense when you need:

1. **Extreme performance** - Handling 10k+ concurrent WebSocket connections
2. **Embedded systems** - Running on IoT devices with 64MB of RAM
3. **Custom crypto** - Implementing novel cryptographic algorithms
4. **Kernel-level code** - Writing device drivers or OS components

KeyPears doesn't need any of these yet. Our server will handle dozens of
concurrent users, not thousands. Our desktop app runs on modern laptops with
gigabytes of RAM. Our cryptography comes from well-tested libraries (Blake3,
AES-256). We're building a user-facing application, not infrastructure.

**Later, Rust might make sense for:**

- High-throughput sync server (if we grow to enterprise scale)
- Mobile performance optimization (if WASM proves too slow)
- Custom Diffie-Hellman implementation (if existing libraries don't fit)

But even then, we'd keep the API layer in TypeScript (orpc is too good to give
up) and only move performance-critical sync logic to Rust via FFI.

## The Right Tool for the Right Job

Software architecture isn't about using the "best" language—it's about using the
right tool for the constraints you're facing.

Our constraints:

- **Side project timeline**: Limited evening/weekend hours
- **Solo developer**: No team to split Rust vs TypeScript work
- **MVP goal**: Prove the concept before scaling
- **Rapid iteration**: Features change based on user feedback

For these constraints, TypeScript is objectively better:

- Faster iteration (100ms hot reload vs 5s compile)
- Single mental model (no context switching)
- Richer ecosystem (orpc, Drizzle, React Router)
- Lower cognitive overhead (one type system, one package manager)

We still get Rust's security properties through WASM. We still get type safety
through TypeScript. We still get performance (crypto is WASM, API is fast
enough).

## What We Learned

**1. Blog posts are aspirational, code is truth**

That October post was honest about our intentions. We really did plan to build a
Rust backend. But intentions don't ship products—working code does. When we
started building features instead of infrastructure, TypeScript kept winning.

**2. Ecosystem maturity matters more than language performance**

The Rust language is excellent. But for web applications, the TypeScript
ecosystem is years ahead. orpc's zero-codegen type safety is revolutionary.
Drizzle's unified SQLite + Postgres support is essential for our architecture.
These don't exist in Rust.

**3. WASM changes the game**

Ten years ago, you had to choose: safe languages (Ruby, Python, JavaScript) or
fast languages (C, C++, Rust). Today, you can write your performance-critical
code in Rust, compile it to WASM, and use it from any language. Best of both
worlds.

**4. Ship first, optimize later**

Premature optimization is still the root of all evil. We don't need Rust's 10x
performance improvement for an API server that handles 10 requests per second.
We need working features that users can try. TypeScript gets us there faster.

## The Current Priority: Shipping the MVP

With this architecture decision settled, we're focused on shipping a working
product:

**Next milestones:**

1. **Server vault CRUD** - Create/read/update vaults via API
2. **User authentication** - Session-based login with hashed login key
3. **Basic sync protocol** - Last-write-wins synchronization
4. **Mobile Tauri build** - iOS + Android apps
5. **Import/export** - Backup and restore vaults

All of this will be TypeScript. The API server will use orpc. The database will
use Drizzle (Postgres on server, SQLite on clients). The cryptography will
remain Rust-compiled WASM.

And if we're wrong—if we hit performance walls or need Rust for specific
features—we can always add Rust modules later. The architecture supports it. But
we're not starting there.

## Try It Yourself

The Blake3 endpoint is live:

```bash
curl -X POST https://keypears.com/api/blake3 \
  -H "Content-Type: application/json" \
  -d '{"data": "SGVsbG8sIEtleVBlYXJzIQ=="}'
```

That `data` field is base64-encoded "Hello, KeyPears!". The API will return the
Blake3 hash computed by Rust (via WASM) running in Node.js on our TypeScript
server.

It's a small proof-of-concept, but it validates the entire architecture:
TypeScript for the API layer, Rust-via-WASM for cryptography, type safety
end-to-end.

## Conclusion

We're not building KeyPears with Rust. We're building it with **TypeScript +
WASM**, which gives us Rust's security properties without Rust's ecosystem
limitations.

This is the right call for our MVP. It lets us move faster, iterate quicker, and
ship working features instead of rewriting infrastructure.

Rust is an incredible language. But for this project, at this stage, TypeScript
is the pragmatic choice.

We'll keep sharing our progress—both the wins and the pivots. If you're
interested in following along:

- **Live demo**: Try the Blake3 endpoint at https://keypears.com/api/blake3
- **Source code**: Coming soon on GitHub under Apache 2.0 license

More updates coming soon. Next post: Implementing the vault synchronization
protocol.
