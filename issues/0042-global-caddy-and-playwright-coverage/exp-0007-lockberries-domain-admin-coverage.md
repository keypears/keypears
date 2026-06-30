# Experiment 7: Lockberries Domain Admin Coverage

## Description

Add E2E coverage for the remaining Issue 42 third-party hosted domain flow:
`lockberries.test` is a domain with only a landing page and a
`/.well-known/keypears.json` file that points at `keypears.test` and advertises
`lockberries@keypears.test` as admin. The current app supports claiming that
domain from the Domains page and administering users for it on the
`keypears.test` server.

This experiment should prove the supported flow through the real UI and server
authorization checks, while keeping the existing Caddy, database reset,
Playwright, and real browser WebGPU PoW harness.

The claim path depends on the primary `keypears.test` domain allowing
third-party domain hosting. A freshly reset E2E database satisfies this through
the normal app path: account onboarding calls `saveMyUser`, which calls
`getOrCreateDomain("keypears.test")`; the `domains.allowThirdPartyDomains`
schema default is `true`. The test must not seed or mutate this flag directly.

## Changes

- Add a Playwright spec for the `lockberries.test` domain-admin flow.
- Create the exact admin account advertised by the local well-known file:
  `lockberries@keypears.test`. This fixed address is safe because each E2E run
  resets the database before tests; only the created `@lockberries.test` user
  needs a unique suffix.
- On the Domains page, claim `lockberries.test` through the normal form and
  verify it appears under My Domains.
- Expand the claimed domain card and create a new `@lockberries.test` user
  through the admin add-user form.
- Verify the new domain user appears in the domain user list.
- Log out as the admin, then log in as the new `@lockberries.test` user through
  the `keypears.test` server and verify the authenticated home page shows the
  `@lockberries.test` address.
- Keep assertions on stable user-visible UI. Add accessibility-positive labels
  only if the current form cannot be tested reliably without them.
- Use selector mechanics that match the current Domains UI:
  - fill the claim form's unique `e.g. lockberries.test` placeholder rather
    than an ambiguous `Domain` label that can also match `API domain`;
  - rely on the prefilled API domain and admin fields, which should be
    `keypears.test` and `lockberries@keypears.test`;
  - expand the claimed domain with the button containing `lockberries.test`;
  - fill the add-user address using the `alice@lockberries.test` placeholder,
    blur it, wait for `This address is available!`, and only then click
    `Create`, because availability is checked on blur and controls whether the
    Create button is enabled.
- Do not add test-only domain, auth, password, or PoW bypasses.
- Do not modify the TermSurf repository.

## Verification

- Start or verify Caddy is running from
  `/Users/astrohacker/.config/caddy/Caddyfile`.
- Run `/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`.
- Run `bun run e2e -- lockberries-domain-admin.spec.ts` from `webapp/`.
- Run `bun run e2e` from `webapp/` and verify the full suite passes.
- Run `bun run typecheck` from `webapp/`.
- Run `bun run lint` from `webapp/`.
- Run touched-file Prettier checks.
- Run `scripts/build-issues-index.sh` from the repo root.
- Verify the test uses `https://lockberries.test/.well-known/keypears.json`
  indirectly through the real claim/admin server functions, not by seeding the
  database directly.
- Verify the admin and user login steps use real browser WebGPU PoW through the
  existing account creation/login path.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0007-lockberries-domain-admin-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/e2e/multi-domain-federation.spec.ts \
  --context webapp/src/routes/_app/_saved/_chrome/domains.tsx \
  --context webapp/src/server/user.functions.ts \
  --context webapp/src/server/federation.server.ts \
  --context lockberries/src/pages/.well-known/keypears.json.ts \
  "Design review for Issue 42 Experiment 7..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-084128-708120-prompt.md`
- Stdout:
  `logs/claude-review/20260630-084128-708120-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - confirm and record how the real E2E path satisfies the
    `allowThirdPartyDomains` precondition without direct database seeding;
  - specify concrete selector and blur mechanics for the Domains UI;
  - record that the fixed `lockberries@keypears.test` admin address depends on
    the E2E database reset.
- Resolution: this design now records the schema-backed precondition, the exact
  selectors/blur behavior, and the fixed-admin/reset dependency.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0007-lockberries-domain-admin-coverage.md \
  --context webapp/src/db/schema.ts \
  --context webapp/src/server/user.server.ts \
  --context webapp/src/server/user.functions.ts \
  --context webapp/src/routes/_app/_saved/_chrome/domains.tsx \
  --context lockberries/src/pages/.well-known/keypears.json.ts \
  "Follow-up design review for Issue 42 Experiment 7 after required findings were addressed..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-084431-945373-prompt.md`
- Stdout:
  `logs/claude-review/20260630-084431-945373-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Resolution: no additional design changes were required after follow-up
  review.

## Result

Pass.

Added `webapp/e2e/lockberries-domain-admin.spec.ts`, which exercises the
supported `lockberries.test` third-party hosted domain flow through the real UI
and server authorization path:

- creates the exact advertised admin account,
  `lockberries@keypears.test`, through the normal account creation flow;
- opens the Domains page on `keypears.test` and verifies the generated claim
  form is prefilled with `keypears.test` as API domain and
  `lockberries@keypears.test` as admin;
- claims `lockberries.test`, which forces the server-side
  `claimDomainFn -> verifyDomainAdmin -> fetchKeypearsJson` path to fetch the
  live `https://lockberries.test/.well-known/keypears.json` file through Caddy;
- expands the claimed domain card, creates a unique `@lockberries.test` user
  through the admin add-user form, and verifies the new user appears in the
  domain user list;
- logs out as the admin and logs in as the new `@lockberries.test` user through
  the `keypears.test` server.

Verification run on 2026-06-30:

- `/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`
  passed.
- `bun run e2e -- lockberries-domain-admin.spec.ts` passed: 1 test.
- `bun run e2e` passed: 8 tests.
- `bun run typecheck` passed.
- `bun run lint` passed with the pre-existing four `oxc(no-map-spread)`
  warnings in `src/server/vault.functions.ts` and
  `src/server/user.functions.ts`.
- `bunx prettier --check e2e/lockberries-domain-admin.spec.ts` passed.
- `scripts/build-issues-index.sh` passed and reported 4 open, 38 closed
  issues.

## Conclusion

Experiment 7 added the missing lockberries/custom-domain administration
coverage for Issue 42. The test proves that a domain advertised by a local
third-party landing page can be claimed by its well-known admin, administered
from the KeyPears Domains UI, and used for a hosted `@lockberries.test` login on
the `keypears.test` server. The flow uses the real Caddy-backed `.test`
topology, real server-side well-known verification, normal authenticated admin
server functions, and real browser WebGPU PoW for account creation and login.
No test-only domain, auth, password, or PoW bypass was added.

## Completion Review

External Claude review via:

```bash
git diff --staged | python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0007-lockberries-domain-admin-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/e2e/lockberries-domain-admin.spec.ts \
  --context webapp/src/routes/_app/_saved/_chrome/domains.tsx \
  --context webapp/src/server/user.functions.ts \
  --context webapp/src/server/federation.server.ts \
  --context lockberries/src/pages/.well-known/keypears.json.ts \
  "Completion review for Issue 42 Experiment 7..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-085028-001421-prompt.md`
- Stdout:
  `logs/claude-review/20260630-085028-001421-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Non-blocking finding:
  - prefer `toHaveValue` label/property assertions over CSS
    `input[value="..."]` selectors for the prefilled API domain and admin
    fields.
- Resolution: the prefilled field assertions now use
  `getByLabel("API domain").toHaveValue("keypears.test")` and
  `getByLabel("Admin").toHaveValue("lockberries@keypears.test")`. The targeted
  spec was rerun after this change and passed.
