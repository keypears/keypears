+++
status = "open"
opened = "2026-06-30"
workflow = "issues-and-experiments"
review_mode = "external-claude"
review_routing = "orthogonal-review"
+++

# Issue 42: Global Caddy and Playwright Coverage

## Goal

Move KeyPears local HTTPS routing into a shared user-level Caddy configuration
and add end-to-end Playwright coverage for the major KeyPears workflows across
the local multi-domain topology.

## Background

KeyPears currently documents a project-specific Caddyfile at
`~/.caddy/Caddyfile` in `webapp/src/docs/development.md`. TermSurf keeps a
project-local reference Caddyfile at `~/dev/termsurf-com/dev/Caddyfile`, but
that repository must not be changed for this work.

The local machine has Caddy installed through Homebrew:

- binary: `/opt/homebrew/bin/caddy`
- version: `v2.11.4`
- existing state directory: `~/.config/caddy/`

`~/.config/caddy/Caddyfile` is the better target for a user-run shared
development config because it follows the XDG config convention and already
matches Caddy's user state location on this machine. If the issue chooses to run
Caddy as a Homebrew service instead, it must explicitly evaluate whether
`/opt/homebrew/etc/Caddyfile` is the better service-managed location. The
default direction is a shared user config at:

```text
~/.config/caddy/Caddyfile
```

The global Caddyfile should be able to include routes for multiple local
projects at the same time, including TermSurf-style project domains and all
KeyPears dev domains, without editing the TermSurf repository.

## Current KeyPears Local Domains

KeyPears needs these local HTTPS routes:

| Domain                     | Upstream port | Purpose                                 |
| -------------------------- | ------------- | --------------------------------------- |
| `keypears.test`            | 3500          | Primary self-hosted KeyPears server     |
| `passapples.test`          | 3510          | Astro landing page for subdomain host   |
| `keypears.passapples.test` | 3512          | KeyPears server for `passapples.test`   |
| `lockberries.test`         | 3520          | Astro landing page for third-party host |

The Caddy config should use local TLS suitable for browser tests and should
preserve the existing dnsmasq `.test` setup.

## Requirements

### Caddy Configuration

- Do not modify `~/dev/termsurf-com`.
- Create or update the shared Caddy config at `~/.config/caddy/Caddyfile` unless
  the first experiment proves a better user-level location.
- Preserve compatibility with having multiple local projects running behind the
  same Caddy instance.
- Add all KeyPears local domains and port mappings.
- Validate and format the Caddyfile with Caddy's own tooling.
- Update KeyPears development docs from `~/.caddy/Caddyfile` to the chosen
  shared config path.
- Document start, reload, stop, and validate commands for the chosen path.
- Make it clear when to use user-run Caddy versus a Homebrew service config.

### Playwright Test Infrastructure

- Add a Playwright test setup for KeyPears end-to-end flows.
- Tests must run against the local HTTPS `.test` domains through Caddy, not only
  raw localhost ports.
- Tests must have a reliable way to prepare databases for repeatable runs.
- Tests must perform real browser WebGPU proof-of-work mining. They may use
  configured low non-production difficulty for repeatability, but must not add a
  test-only PoW bypass or fake solution path.
- Tests must fail early with a clear setup error if the Playwright browser
  cannot expose WebGPU.
- Tests must avoid embedding real secrets.
- Tests should collect useful traces, screenshots, or videos on failure.

### Core Flow Coverage

Cover the major user-facing workflows:

- create a new account on `keypears.test`;
- log out and log back in;
- complete onboarding with a full `name@domain` address and password;
- send a message between users on `keypears.test`;
- receive and read the message as the recipient;
- verify sender-side retained/sent message visibility where the UI supports it;
- create, search, open, edit, and delete vault/password entries;
- rotate or inspect key-management behavior enough to catch locked-key
  regressions;
- change password and verify the new password works;
- update proof-of-work difficulty settings where practical;
- claim or administer a custom domain where the local well-known setup supports
  it.

### Multi-Domain and Federation Coverage

Cover the local deployment patterns:

- create/login on `keypears.test`;
- create/login for `passapples.test` users through `keypears.passapples.test`;
- verify `https://passapples.test/.well-known/keypears.json` points to
  `keypears.passapples.test`;
- verify `https://lockberries.test/.well-known/keypears.json` points to
  `keypears.test`;
- send from `alice@keypears.test` to `bob@passapples.test`;
- send from `bob@passapples.test` to `alice@keypears.test`;
- exercise a third-party hosted domain flow for `lockberries.test`, including
  admin/domain creation if supported by the current app.

## Constraints

- Keep this issue focused on local dev routing and end-to-end test coverage.
- Do not change TermSurf files.
- Do not lower production proof-of-work or production security settings to make
  tests pass.
- Do not rewrite historical issues to fit the new workflow.
- Use one experiment at a time. Do not design future experiments until the
  previous experiment is implemented, verified, reviewed, and committed.

## Initial Analysis

The first experiment should likely inventory the current Caddy runtime behavior
and choose the exact shared config path. `~/.config/caddy/Caddyfile` is the
preferred starting point because Caddy already stores user state in
`~/.config/caddy/`, while `/opt/homebrew/etc/Caddyfile` is more appropriate if
this issue decides to run Caddy through Homebrew services.

After the shared Caddy config is established, subsequent experiments can add the
Playwright harness and then expand coverage by workflow area. The test work is
large enough that it should be split into reviewed experiments rather than done
as one unbounded pass.

## Experiments

- [Experiment 1: Shared Caddy config](exp-0001-shared-caddy-config.md) —
  **Pass**
- [Experiment 2: Playwright account lifecycle harness](exp-0002-playwright-account-lifecycle-harness.md)
  — **Pass**
- [Experiment 3: Same-domain messaging coverage](exp-0003-same-domain-messaging-coverage.md)
  — **Pass**
