# KeyPears

**Federated Diffie-Hellman Key Exchange Protocol**

---

**KeyPears** is the first **federated, end-to-end encrypted Diffie-Hellman key
exchange platform.**\
Like email, but for cryptographic key exchange — enabling secure communication
between any two email addresses (`alice@example.com` ↔ `bob@example2.com`).\
Unlike traditional systems locked inside one provider, KeyPears enables
**secure, cross-domain key exchange** for passwords, crypto wallets, and secret
sharing while giving users the freedom to self-host, federate, and retain
complete control.

---

## 🌍 Vision

Our vision is to make **secure Diffie-Hellman key exchange as universal as
email**:

- Open-source clients and servers anyone can run.
- Identities that work across domains (`alice@keypears.com` ↔
  `bob@example.org`).
- Decentralized Diffie-Hellman key exchange enabling secure communication
  between any two email addresses.
- **End-to-end encrypted messaging** between any two vault addresses.
- End-to-end encryption for every secret — whether it's a password, API key, or
  crypto wallet.
- A federated network that empowers individuals, teams, and enterprises to
  establish secure communication channels without lock-in.

KeyPears is not just a tool — it's a protocol for how humans and machines can
exchange cryptographic keys and secrets safely in a connected world.

---

## 🚀 Technology Stack

- **Node.js + TypeScript** — Core server and client logic.
- **React Router 7** — Modern front-end routing for the web client.
- **WebBuf** — High-performance buffer library for Node.js and browsers.
- **WASM Cryptography** — SHA-256 and ACS2 encryption via TypeScript WASM
  packages (`@webbuf/sha256`, `@webbuf/acs2`).
- **Tauri** — Cross-platform native apps for **Windows, macOS, Linux, Android,
  and iOS**. One codebase, all platforms.

---

## 🖥️ Client

The **open-source KeyPears client** manages user identities and secrets across
multiple nodes.

- Supports multiple identities per user (e.g. `alice@keypears.com`,
  `alice@selfhosted.org`).
- Provides an intuitive UI for storing, retrieving, and sharing secrets.
- Runs in the browser, desktop, and mobile via Tauri.
- Handles encryption/decryption locally, ensuring secrets never leave the device
  unprotected.

---

## 🌐 Server

The **open-source KeyPears server** hosts user identities and encrypted secrets.

- **Zero-knowledge architecture**: All secrets and metadata are encrypted
  client-side before reaching the server.
- Server stores only **encrypted blobs** — it cannot see passwords, usernames,
  domain names, or any secret content.
- Implements a **federated identity model** — like email, users can have
  addresses across multiple nodes (`user@domain`).
- Users can self-host for maximum control, or use hosted providers.

---

## 🔑 Decentralized Diffie-Hellman Key Exchange

KeyPears introduces a **peer-to-peer, federated Diffie-Hellman key exchange
system**:

- Any user at one node can establish a secure communication channel with a user
  at another node via Diffie-Hellman key exchange.
- Example: `alice@example1.com` ↔ `bob@example2.com`
- Under the hood, each email address corresponds to a **public key**, enabling
  **decentralized Diffie-Hellman key exchange** and **true end-to-end
  encryption** across domains.
- **Currently implemented**: Secure secret sharing and encrypted messaging.
- **Future**: Cryptocurrency wallet functionality built on the same DH exchange
  foundation.

This makes KeyPears uniquely suited for collaboration across organizations,
vendors, and teams — no more being locked into a single provider.

---

## 🏛️ Main Node: [keypears.com](https://keypears.com)

- The **primary public node** is hosted at `keypears.com`.
- **Freemium model**: Free tier for personal use, premium tier for power users
  (pricing TBD).
- Anyone can also self-host a node for private or enterprise use.

---

## 👥 Target Audiences

KeyPears is designed for a broad set of use cases:

- **Consumers** — Manage personal passwords securely, with cross-device sync.
- **Software Companies & Developers** — Share API keys, config secrets, and
  credentials safely across teams and environments.
- **Enterprises** — Provide employees with a federated, auditable, yet private
  platform for secret management.
- **Cryptocurrency Users** — Store and share wallet keys, signing keys, and seed
  phrases securely.
- **Privacy Enthusiasts & Self-Hosters** — Run your own node for maximum control
  and autonomy.

---

## 🌱 Project Status

KeyPears is in **active development** with core features implemented:

- ✅ Password management with cross-device sync
- ✅ Federated Diffie-Hellman key exchange across domains
- ✅ End-to-end encrypted messaging
- ✅ Proof-of-work spam protection
- 🔄 Payment system (in progress)

The app is deployed at [keypears.com](https://keypears.com). Public contribution
guidelines coming soon.

---

## 📚 Documentation

### Getting Started

- **[AGENTS.md](AGENTS.md)** — Guide for AI agents and developers working on
  KeyPears

### Architecture & API

- **[docs/orpc.md](docs/orpc.md)** — oRPC API architecture (contract-first,
  type-safe)
- **[docs/dh.md](docs/dh.md)** — Diffie-Hellman key exchange protocol
- **[docs/messages.md](docs/messages.md)** — Secure messaging protocol
- **[docs/auth.md](docs/auth.md)** — Authentication system (session tokens)

### Cryptography

- **[docs/kdf.md](docs/kdf.md)** — Key derivation functions (password → keys)
- **[docs/vault-keys.md](docs/vault-keys.md)** — Vault key architecture
  (secp256k1)
- **[docs/pow.md](docs/pow.md)** — Proof-of-work spam protection
- **[docs/engagement-keys.md](docs/engagement-keys.md)** — Engagement keys for
  messaging

### Development

- **[docs/code.md](docs/code.md)** — Code patterns and conventions
- **[docs/data.md](docs/data.md)** — Database and data handling patterns
- **[docs/uiux.md](docs/uiux.md)** — UI/UX design patterns
- **[docs/deployment.md](docs/deployment.md)** — AWS deployment guide

### Business

- **[docs/vision.md](docs/vision.md)** — Project vision and long-term goals
- **[docs/mvp.md](docs/mvp.md)** — MVP requirements and success criteria
- **[docs/business.md](docs/business.md)** — Business model and strategy
- **[docs/audit.md](docs/audit.md)** — Security audit checklist

---

## 📜 License & Ownership

- Code is licensed under the **Apache 2.0 License**.
- All code is **open source** and free to use under the license terms.
- The **KeyPears** brand and associated trademarks are owned by **Identellica
  LLC**.

---
