# KeyPears

**Decentralized Diffie-Hellman Key Exchange System**

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
- **Rust + WASM** — Custom cryptography written in Rust, compiled to
  WebAssembly, using WebBuf for efficient buffer handling.
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

- Stores **all secrets encrypted at rest**.
- Servers can see minimal non-private metadata (e.g. entry name or account
  label) for indexing/search.
- Users who need maximum privacy can run their own node and control all
  metadata.
- Implements a **federated identity model** — like email, users can have
  addresses across multiple nodes (`user@domain`).

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
- This enables secure secret sharing, encrypted messaging, and cryptocurrency
  wallet functionality all built on the same DH exchange foundation.

This makes KeyPears uniquely suited for collaboration across organizations,
vendors, and teams — no more being locked into a single provider.

---

## 🏛️ Main Node: [keypears.com](https://keypears.com)

- The **primary public node** will be hosted at `keypears.com`.
- Users can join for free and use the service with ads.
- Premium users can pay a small subscription fee to **remove ads** and help
  support the network.
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

This README is currently **for internal use only**.\
Future versions will include installation instructions, developer guides, and
contribution guidelines once the codebase is ready for public release.

---

## 📜 License & Ownership

- Code is licensed under the **Apache 2.0 License**.
- All code is **open source** and free to use under the license terms.
- The **KeyPears** brand and associated trademarks are owned by **Identellica
  LLC**.

---
