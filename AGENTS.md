# Guide for AI Agents Working on KeyPears

The KeyPears project is a new password manager designed to solve the following
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
  including cryptocurrency wallet keys.
- Business users who need to share secrets securely among team members and who
  do not have a company Bitwarden or 1Password account. KeyPears allows them to
  run their own node completely for free, similar in principle to email.

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

Note that the project is very early in is development and will likely change in
structure with time.

## Folder Layout

At the top level, the repository has the following folders:

- `lib`: The source code for `@keypears/lib`.
- `tauri`: The source code for `@keypears/tauri`.
- `webapp`: The source code for `@keypears/webapp`.

All projects are managed with `pnpm` and share a common pnpm workspace. The pnpm
workspace file is `pnpm-workspace.yaml`.

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
- Always used `shadcn` for components. There is a catppuccin-esque theme defined
  in the `css` files for shadcn.
- Always use `pnpm run lint` to lint code before committing.
- Always use `pnpm run test` to run tests before committing.
- Always use `pnpm run typecheck` to typecheck code before committing.

### Rust Patterns

- Never use `unwrap` without proper handling of error-cases immediately before.

## Concluding Thoughts

KeyPears is a new type of password manager designed for full self-custody of
passwords and other secrets while simultaneously solving the problem of
synchronization and sharing. The basic idea is to invent a crypto-first protocol
similar in architecture to email, but based on end-to-end asymmetric
cryptography so that users can share secrets securely.
