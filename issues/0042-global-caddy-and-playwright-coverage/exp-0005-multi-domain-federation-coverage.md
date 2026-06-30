# Experiment 5: Multi-Domain Federation Coverage

## Description

Extend the Playwright E2E harness from single-node `keypears.test` coverage to
the local multi-domain topology needed for federation.

This experiment should prove that the test harness can run two KeyPears servers
and the local landing-page domains through the shared Caddy instance, verify
well-known discovery, and send/read encrypted messages across
`keypears.test` and `passapples.test` in both directions.

The scope is cross-domain messaging and discovery. Password changes,
key-management regressions, PoW settings, and `lockberries.test` domain-admin
flows remain separate workflows unless this experiment directly uncovers a
blocking setup bug.

## Changes

- Add a deterministic E2E environment for the passapples KeyPears server:
  - `KEYPEARS_DOMAIN="passapples.test"`;
  - `KEYPEARS_API_DOMAIN="keypears.passapples.test"`;
  - a separate MySQL database such as `keypears_e2e_passapples`;
  - a deterministic non-secret E2E-only `KEYPEARS_SECRET` value;
  - a non-production `KEYPEARS_E2E_POW_DIFFICULTY="1"` value so account and
    message proof-of-work still mine through real browser WebGPU at low
    difficulty.
- Update the E2E database setup so it can create/reset the allowed E2E
  databases for both local KeyPears nodes before Playwright starts web servers:
  - keep an explicit allowlist such as `keypears_e2e` and
    `keypears_e2e_passapples`;
  - create, clear, and push schema for both databases using their own env files;
  - keep refusing all non-E2E database names.
- Add E2E dev scripts for the passapples KeyPears server and, if needed, for
  the passapples and lockberries Astro landing pages with explicit loopback
  hosts and fixed ports.
- Ensure both KeyPears E2E dev scripts set `NODE_TLS_REJECT_UNAUTHORIZED=0`, or
  otherwise explicitly trust the Caddy local root in Node, because federation
  server-to-server requests fetch `https://*.test` URLs through Caddy's internal
  CA in both directions.
- Update `webapp/playwright.config.ts` to start all servers required for
  federation coverage through an explicit Playwright `webServer` array. Each
  entry should have its own URL, `ignoreHTTPSErrors: true`, and
  `reuseExistingServer: false`:
  - `https://keypears.test` → webapp on port 3500;
  - `https://keypears.passapples.test` → webapp on port 3512;
  - `https://passapples.test` → Astro landing page on port 3510, required
    because federation resolves `passapples.test` through its well-known file;
  - `https://lockberries.test` → Astro landing page on port 3520 if the
    well-known assertion is included in this experiment.
- Keep tests running through Caddy HTTPS `.test` domains; do not switch
  federation paths to raw localhost ports.
- Extend the account E2E helpers so account creation, login, logout, home
  assertions, and message helper navigation can target a supplied origin/domain
  instead of always using the Playwright `baseURL`.
- Parameterize account helper address generation and domain-specific selectors:
  - `uniqueAccount` should accept an address domain so Bob can be created as
    `bob...@passapples.test`;
  - account creation should target the onboarding placeholder for the selected
    domain, such as `yourname@passapples.test`;
  - login should target the login placeholder for the selected domain if the UI
    templates it.
- Add a multi-domain E2E spec that:
  - verifies `https://passapples.test/.well-known/keypears.json` returns
    `apiDomain: "keypears.passapples.test"`;
  - verifies `https://lockberries.test/.well-known/keypears.json` returns
    `apiDomain: "keypears.test"` and `admin: "lockberries@keypears.test"`,
    unless starting the lockberries landing page creates a clear harness problem
    that should be split into its own experiment;
  - creates and onboards Alice on `https://keypears.test` as
    `alice...@keypears.test`;
  - creates and onboards Bob on `https://keypears.passapples.test` as
    `bob...@passapples.test`;
  - logs in Alice on `keypears.test`, sends a unique message to Bob's
    `passapples.test` address, and verifies Alice's retained sender-side
    channel view;
  - logs in Bob on `keypears.passapples.test`, verifies Bob sees Alice in the
    inbox, opens the channel, decrypts the exact message, and verifies unread
    count clears;
  - sends a unique reply from Bob on `keypears.passapples.test` to Alice's
    `keypears.test` address;
  - logs in Alice on `keypears.test`, verifies Alice receives and decrypts
    Bob's exact reply.
- Reuse the real WebGPU proof-of-work path for account creation, login, and
  message sending. Do not add a fake PoW solver, server-side miner, or
  test-only bypass.
- Treat failures in remote public-key lookup, remote PoW challenge retrieval,
  `notifyMessage`, `pullMessage`, recipient-side decryption, or unread-count
  behavior as in-scope bugs for this experiment.

## Verification

- Start or verify Caddy is running from
  `/Users/astrohacker/.config/caddy/Caddyfile`.
- Run `/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`.
- Run `bun run e2e` from `webapp/` and verify account lifecycle,
  same-domain messaging, vault CRUD, and the new multi-domain federation tests
  pass.
- Run `bun run typecheck` from `webapp/`.
- Run `bun run lint` from `webapp/`.
- Run touched-file Prettier checks.
- Run `scripts/build-issues-index.sh` from the repo root.
- Verify the multi-domain tests reach all app and landing-page servers through
  Caddy HTTPS domains.
- Verify the cross-domain message tests use real WebGPU PoW with low E2E
  difficulty and do not add any test-only PoW bypass.
- Verify each KeyPears node uses its own database and domain configuration so
  the test proves federation instead of accidentally using one local domain
  table.
- Verify both KeyPears E2E dev scripts include Node TLS handling for Caddy's
  local CA.
- Verify `create-e2e-db.ts` still refuses any database outside the explicit E2E
  allowlist.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0005-multi-domain-federation-coverage.md \
  --context webapp/playwright.config.ts \
  --context webapp/package.json \
  --context package.json \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/e2e/same-domain-messaging.spec.ts \
  --context webapp/src/server/federation.server.ts \
  --context webapp/src/server/api.router.ts \
  --context webapp/scripts/create-e2e-db.ts \
  --context passapples/src/pages/.well-known/keypears.json.ts \
  --context lockberries/src/pages/.well-known/keypears.json.ts \
  "Design review for Issue 42 Experiment 5..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-075013-720921-prompt.md`
- Stdout:
  `logs/claude-review/20260630-075013-720921-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - specify `KEYPEARS_SECRET` in the passapples E2E env;
  - specify Node TLS handling for server-to-server federation over Caddy's
    internal CA on both KeyPears E2E scripts;
  - parameterize account helper address domains and domain-specific onboarding
    and login placeholders;
  - specify dual-database reset ordering and an explicit E2E database allowlist;
  - specify Playwright `webServer` array entries with their own URLs and HTTPS
    settings.
- Resolution: this design now includes those required setup, helper,
  Playwright, and verification details.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0005-multi-domain-federation-coverage.md \
  --context webapp/playwright.config.ts \
  --context webapp/package.json \
  --context package.json \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/scripts/create-e2e-db.ts \
  "Follow-up design review for Issue 42 Experiment 5 after required findings were addressed..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-075408-379820-prompt.md`
- Stdout:
  `logs/claude-review/20260630-075408-379820-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Resolution: no additional design changes were required after follow-up
  review.

## Result

Pass.

Implemented a multi-domain E2E harness that runs both local KeyPears nodes and
the passapples/lockberries landing pages through the shared Caddy HTTPS config.
The Playwright suite now starts:

- `https://keypears.test` backed by the webapp on port 3500;
- `https://keypears.passapples.test` backed by the webapp on port 3512 with
  `KEYPEARS_DOMAIN="passapples.test"`;
- `https://passapples.test` backed by the Astro landing page on port 3510;
- `https://lockberries.test` backed by the Astro landing page on port 3520.

The E2E database reset now creates, clears, and pushes both `keypears_e2e` and
`keypears_e2e_passapples` before Playwright starts web servers. The database
creation script keeps an explicit allowlist for those two databases and refuses
all other names.

The account helpers now support a supplied origin and address domain, while
preserving `keypears.test` defaults for existing tests. The new federation spec
verifies:

- `passapples.test` advertises `apiDomain:
"keypears.passapples.test"`;
- `lockberries.test` advertises `apiDomain: "keypears.test"` and `admin:
"lockberries@keypears.test"`;
- Alice can create/login on `keypears.test`;
- Bob can create/login on `keypears.passapples.test` with a
  `bob...@passapples.test` address;
- Alice can send an encrypted message to Bob across domains;
- Bob receives, decrypts, reads, and clears the unread message;
- Bob can reply across domains;
- Alice receives, decrypts, reads, and clears Bob's reply.

The first implementation run surfaced two real harness/protocol issues:

- Playwright was launched under `.env.e2e`, causing child webServer processes
  to inherit `KEYPEARS_DOMAIN="keypears.test"`. The E2E script now runs
  Playwright without a parent dotenv wrapper; each webServer command loads its
  own env file.
- `safeFetch` blocked local `.test` federation because dnsmasq resolves those
  domains to `127.0.0.1`. `safeFetch` now allows `.test` hostnames only when
  `NODE_ENV !== "production"`, preserving production private-address blocking
  while allowing local Caddy federation tests.

Verification run:

```text
/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile
Valid configuration

bun run e2e -- multi-domain-federation.spec.ts
2 passed

bun run e2e
6 passed

bun run typecheck
tsc --noEmit

bun run lint
Found 4 warnings and 0 errors.

bunx prettier --check e2e/multi-domain-federation.spec.ts e2e/helpers/account.ts package.json playwright.config.ts scripts/create-e2e-db.ts src/server/fetch.ts
All matched files use Prettier code style!

scripts/build-issues-index.sh
issues/README.md: 4 open, 38 closed
```

The lint warnings are the existing `no-map-spread` warnings in
`src/server/vault.functions.ts` and `src/server/user.functions.ts`.

## Conclusion

Experiment 5 passes. Issue 42 now has E2E coverage for well-known discovery and
bidirectional encrypted federation between separate local KeyPears nodes with
separate databases, distinct address domains, and real browser WebGPU
proof-of-work. The harness proves the cross-domain path through remote key
lookup, remote PoW challenge retrieval, `notifyMessage`, `pullMessage`,
recipient decryption, and unread clearing without a test-only PoW bypass.

## Completion Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0005-multi-domain-federation-coverage.md \
  --context webapp/e2e/multi-domain-federation.spec.ts \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/package.json \
  --context webapp/playwright.config.ts \
  --context webapp/scripts/create-e2e-db.ts \
  --context webapp/src/server/fetch.ts \
  --context webapp/.env.e2e.passapples \
  "Completion review for Issue 42 Experiment 5..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-080647-984029-prompt.md`
- Stdout:
  `logs/claude-review/20260630-080647-984029-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Non-blocking recommendations:
  - add an explanatory comment to the non-production `.test` `safeFetch`
    allowance;
  - explicitly pin the Astro E2E site ports in package scripts.
- Resolution: added the `safeFetch` comment and pinned passapples/lockberries
  E2E Astro script ports to 3510/3520 before the result commit.
