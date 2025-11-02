+++
title = "Building KeyPears with Rust: Backend Architecture and Blake3 Proof-of-Concept"
date = "2025-10-25T06:00:00-05:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager and cryptocurrency wallet. The design decisions described here represent our development approach and may evolve before our official release.

We're excited to share a major architectural milestone: KeyPears now has a working Rust backend with our first proof-of-concept endpoint. This marks a significant shift in our technical approach, bringing the performance, security, and cross-platform benefits of Rust to our core cryptography and API layer.

## Why Rust for the Backend?

When we started building KeyPears, we knew cryptography and security would be central to everything we do. After evaluating different approaches, we chose to build our backend entirely in Rust for several compelling reasons:

### Performance

Cryptographic operations—hashing, encryption, key derivation—are CPU-intensive. Rust's zero-cost abstractions and lack of garbage collection mean we can achieve performance comparable to C/C++ without sacrificing safety. For operations users will perform thousands of times (encrypting secrets, computing hashes, deriving keys), this performance matters.

### Memory Safety

Password managers and cryptocurrency wallets are high-value targets for attackers. Rust's ownership system and borrow checker eliminate entire classes of vulnerabilities at compile time:

- No buffer overflows
- No use-after-free bugs
- No data races in concurrent code
- No null pointer dereferences

These guarantees mean our cryptographic code has fewer attack surfaces by design.

### Cross-Platform Consistency

KeyPears needs to run everywhere: Windows, macOS, Linux, Android, and iOS. Rust compiles to native code on all these platforms with consistent behavior. The same cryptographic library (`rs-lib`) that powers our server also powers our Tauri desktop app and will eventually power our mobile apps.

This eliminates the "works on my machine" problem and ensures that a secret encrypted on iOS can be decrypted on Windows with identical cryptographic operations.

### Strong Type System

Rust's type system helps us encode security invariants at compile time. For example, we can use the type system to ensure that:

- Encryption keys are never accidentally logged or serialized
- Sensitive data is properly zeroed after use
- API responses match their OpenAPI specifications exactly

This compile-time verification catches bugs before they reach production.

## Architecture Overview

Our Rust backend consists of two main packages:

### `rs-lib`: Core Cryptography Library

`rs-lib` is a shared Rust library containing all our cryptographic implementations:

- **Blake3**: Fast, secure hashing and key derivation
- **ACB3**: AES-256-CBC + Blake3-MAC for authenticated encryption
- **Key derivation**: Three-tier system separating authentication from encryption
- **Data structures**: Core types for vaults, secrets, and synchronization

This library is pure Rust with no external dependencies beyond well-audited cryptography crates. It's designed to be portable and reusable across all our platforms.

### `rs-node`: KeyPears Node (API Server)

`rs-node` is our API server—what we call a "KeyPears node." It uses the Axum web framework to expose REST endpoints that clients can use for cryptographic operations and vault synchronization.

Key features:

- **Axum framework**: Modern, type-safe HTTP server from the Tokio team
- **OpenAPI 3.0**: Full API specification generated from Rust code using `utoipa`
- **Swagger UI**: Interactive API documentation at `/api/docs`
- **Type safety**: Request/response types validated at compile time

The node is designed to be self-hostable. Anyone can run their own KeyPears node for full sovereignty over their data.

## Blake3 Proof-of-Concept

Our first working endpoint is a Blake3 hashing service at `/api/blake3`. You can try it right now:

```bash
curl -X POST https://keypears.com/api/blake3 \
  -H "Content-Type: application/json" \
  -d '{"data": "Hello, KeyPears!"}'
```

This returns:

```json
{
  "hash": "a1b2c3d4..."
}
```

Blake3 is our hashing algorithm of choice for KeyPears. It's:

- **Fast**: Significantly faster than SHA-256 or SHA-3
- **Secure**: 256-bit security with no known attacks
- **Versatile**: Works as both a hash function and a key derivation function
- **Modern**: Designed in 2020 with modern CPU features in mind

We use Blake3 throughout KeyPears:

- Deriving encryption keys from passwords
- Generating message authentication codes (MACs)
- Computing content hashes for deduplication
- Creating deterministic IDs

This proof-of-concept demonstrates the full stack working:

1. Rust backend (`rs-node`) receives the request
2. Rust library (`rs-lib`) performs the Blake3 hash
3. Result is serialized and returned via Axum
4. OpenAPI documentation describes the endpoint
5. Node.js webapp proxies `/api/*` requests to the Rust node

## TypeScript Frontend + Rust Backend

While our backend is Rust, our frontend remains TypeScript. This gives us the best of both worlds:

- **Rust**: Performance and security for cryptography and core logic
- **TypeScript**: Rapid development and rich ecosystem for UI

Our architecture uses:

- **Tauri**: Native desktop apps with Rust backend + web frontend
- **React Router**: Type-safe routing for web and desktop apps
- **shadcn**: UI components with Catppuccin theme
- **Type-safe API client**: Generated from OpenAPI spec for compile-time safety

The Tauri app embeds the same `rs-lib` cryptography that powers the KeyPears node. This means the desktop app has full offline capability—it doesn't need a server for cryptographic operations. The server is only needed for synchronization across devices.

## Deployment Architecture

In production, we run a dual-server setup:

1. **KeyPears node (Rust)**: Runs on port 4274, handles API requests
2. **Webapp server (Node.js)**: Runs on port 4273, serves the landing page and proxies API requests

The Node.js server forwards all `/api/*` requests to the Rust node via `http-proxy-middleware`. This gives us:

- Single-domain simplicity (no CORS issues)
- Independent scaling of API and web traffic
- Clean separation of concerns

Both services run in a single Docker container on AWS Fargate, deployed via ECS.

## Interactive API Documentation

One of the benefits of Rust's `utoipa` library is automatic OpenAPI documentation generation. You can explore our API interactively at:

**https://keypears.com/api/docs**

This Swagger UI is generated directly from our Rust code. Every endpoint, request type, and response type is documented with examples. As we add new endpoints, the documentation updates automatically.

## What's Next?

The Blake3 endpoint is just the beginning. We're actively building:

### Vault Operations
- Create and encrypt vaults
- Derive encryption keys from passwords
- Store and retrieve encrypted secrets

### Synchronization Protocol
- Append-only logs for conflict-free sync
- Server-side coordination for multi-device sync
- End-to-end encryption (servers never see plaintext)

### Diffie-Hellman Key Exchange
- Peer-to-peer secret sharing across domains
- Email-style addressing (`alice@example.com` ↔ `bob@example2.com`)
- Public key discovery via federated nodes

### Cross-Platform Clients
- Desktop apps (Windows, macOS, Linux) via Tauri
- Mobile apps (Android, iOS) - coming soon
- Web interface for emergency access

All of these features will be built on the same foundation: Rust for security-critical operations, TypeScript for user interfaces.

## Open Source and Self-Hostable

Everything we're building is open source under Apache 2.0. You can:

- Review the code for security
- Run your own KeyPears node
- Contribute improvements
- Build custom clients

The KeyPears node is designed to be self-hostable. Our deployment documentation walks through:

- Cross-compiling for Linux (even from macOS)
- Docker containerization
- AWS Fargate deployment
- Domain configuration and SSL

We want KeyPears to be decentralized by default. Anyone should be able to run a node, just like anyone can run an email server.

## Conclusion

Building KeyPears with Rust has been an excellent decision. The language's emphasis on safety, performance, and correctness aligns perfectly with our security requirements. The Blake3 proof-of-concept validates our architecture: Rust backend for cryptography, TypeScript frontend for user experience, and a clean API boundary between them.

We're excited to continue building. If you're interested in following along, check out:

- **Live demo**: Try the Blake3 endpoint at https://keypears.com/api/blake3
- **API docs**: Explore the OpenAPI spec at https://keypears.com/api/docs
- **Source code**: Coming soon on GitHub

We'll continue sharing our progress through these blog posts. Next up: vault encryption and key derivation in Rust.
