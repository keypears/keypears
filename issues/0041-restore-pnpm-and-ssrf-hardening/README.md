+++
status = "open"
opened = "2026-05-20"
+++

# Issue 41: Restore pnpm/Node and SSRF Hardening

## Goal

Restore the good work that was reverted during the production PoW rollback:

- migrate the repo from Bun-first tooling back to pnpm/Node
- restore server-side federation SSRF hardening

Do this without reintroducing the production PoW regression that was fixed in
issue 40.

## Background

During the production login incident, recent code/config changes were rolled
back aggressively to return the app to a known-good state. That was the right
debugging move at the time, but the rollback also removed unrelated work that
should still happen:

- issue 35 moved the workspace toward pnpm/Node so npm package publishing and
  standard JavaScript package workflows work cleanly
- issue 39 hardened federation fetches against SSRF, including the unprotected
  second hop from `keypears.json` `apiDomain` to the remote oRPC API

Issue 40 later showed that the production login problem was not caused by those
changes. The root cause was a latest-Chromium WebGPU behavior change in the
`pow5-64b` WGSL BLAKE3 path. That issue is fixed, production login works again,
and the package browser tests now reproduce the latest-Chromium path locally.

We should restore the reverted pnpm/Node and SSRF work deliberately, with the
new PoW regression tests in place so we do not repeat the production debugging
loop.

## Prior Work

### Issue 35: pnpm/Node Migration

Issue 35 established the desired toolchain direction:

- pnpm as the workspace package manager
- Node as the runtime for package scripts unless a tool specifically requires
  something else
- committed `pnpm-workspace.yaml` and `pnpm-lock.yaml`
- removal of committed Bun lockfiles
- script and documentation updates away from `bun`/`bunx`
- npm-compatible package builds that emit JavaScript and `.d.ts` files

This should be restored in a way that keeps current app behavior intact.

### Issue 39: Federation SSRF Hardening

Issue 39 established the desired federation security direction:

- all server-side federation HTTP requests go through one hardened path
- discovery and remote oRPC calls receive the same SSRF protections
- federation authorities are validated as hostnames or approved
  hostname-plus-port authorities, not arbitrary URLs
- private, loopback, link-local, multicast, documentation, unspecified,
  reserved, and otherwise non-public IP ranges are blocked for IPv4 and IPv6
- both A and AAAA records are checked
- DNS rebinding is avoided by using a vetted/pinned connection strategy or an
  equivalent guarantee
- redirects are blocked
- timeouts and response-size limits are preserved
- local development still works

This should be restored in a simple, maintainable form that matches the final
decisions made before the rollback.

## Requirements

- Keep production login PoW working.
- Keep latest-Chromium `pow5-64b` browser tests passing.
- Restore pnpm/Node workspace tooling and docs.
- Restore npm-compatible package build/publish behavior.
- Restore federation SSRF hardening for both discovery and remote oRPC calls.
- Preserve local development topology:
  - `keypears.test`
  - `keypears.passapples.test`
  - `passapples.test`
  - `lockberries.test`
- Keep the SSRF model simple:
  - require HTTPS
  - require real domain authorities
  - reject localhost/private IP targets
  - do not rely on broad environment-gated security exceptions
- Preserve federation behavior for legitimate public domains.
- Add or restore tests for dangerous federation inputs and DNS/IP edge cases.
- Update docs when package manager, runtime, commands, or self-hosting behavior
  changes.

## Verification

Every experiment that changes code should run the relevant subset of:

```bash
bun run --cwd packages/pow5-ts test
bun run --cwd packages/pow5-ts typecheck
bun run --cwd webapp typecheck
bun run --cwd webapp test
bun run --cwd webapp build
```

After pnpm is restored as authoritative, update the verification commands to
their pnpm equivalents and run those instead.

For SSRF work, also run the server-side federation tests that cover blocked
authorities, blocked DNS answers, redirects, response-size limits, and allowed
public-domain federation.

## Non-Goals

- Do not reopen the issue 40 PoW investigation unless the regression returns.
- Do not change PoW outputs, expected vectors, difficulty, or verification.
- Do not weaken federation SSRF protection to make implementation easier.
- Do not introduce unrelated refactors while restoring reverted work.
- Do not modify closed issues 35, 39, or 40.
