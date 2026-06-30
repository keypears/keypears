# Experiment 6: Account Security Controls Coverage

## Description

Extend the Playwright E2E suite to cover the remaining local account-security
controls called out by Issue 42: password change, key-management behavior, and
proof-of-work difficulty settings.

This experiment should stay single-account and single-domain on `keypears.test`
so it proves these local account controls before the issue moves to the
remaining domain-admin workflow. It should continue using the existing Caddy,
dual-database reset, Playwright multi-server harness, and real browser WebGPU
proof-of-work path.

## Changes

- Add or refine accessibility-positive labels and names needed for stable real
  UI testing:
  - associate password-change inputs with labels or `aria-label`s for current
    password, new password, and confirmation;
  - change the password-change submit button's visible idle text from the
    ambiguous `Password` to a command name such as `Change password`;
  - label the settings sliders for new-conversation and existing-message PoW
    difficulty;
  - add accessible names for key-management actions if current button text is
    insufficient or ambiguous.
- Add an E2E spec that creates and onboards one saved `keypears.test` account,
  then verifies:
  - the Keys page initially shows `Key #1`, `Current`, and `Active`;
  - rotating a key through the normal UI creates `Key #2`, marks it current and
    active, leaves `Key #1` present, and keeps both keys active/unlocked because
    rotation reuses the current password;
  - key assertions are scoped to the row containing `Key #1` or `Key #2`,
    rather than page-global text matches;
  - the Settings page can update both PoW difficulty sliders through a
    deterministic real-UI interaction such as focusing each named range input
    and pressing arrow keys;
  - the settings test asserts the resulting visible `PowBadge` labels and then
    reloads/navigates back to verify the selected values persist via loader
    data. The transient `Saved` status may be asserted opportunistically, but
    persisted values are the durable proof;
  - the Password page rejects mismatched new-password confirmation by asserting
    the inline `Passwords do not match` validation text;
  - changing the account password through the normal UI returns to the home
    page;
  - logging out and attempting to log in with the old password performs the real
    browser PoW login flow and then asserts the login page's concrete failure
    signal, such as `Invalid KeyPears address or password.`, without reusing the
    success-only `login()` helper;
  - logging in with the new password succeeds and still decrypts/uses the
    current account state.
- After password change, revisit the Keys page and verify the current key is
  still active/unlocked and that the previous rotated key did not become
  locked. This is enough to catch the expected locked-key regression for this
  flow; explicitly creating a key under a different password and testing the
  `Locked` display can remain out of scope.
  If the test created a vault entry before changing the password, verify the
  vault entry still decrypts with the new cached key; otherwise keep vault
  re-verification out of scope because Experiment 4 already covers vault CRUD.
- Do not add test-only password, key, or PoW bypasses.
- Do not change production PoW defaults or production password/key semantics.
- Treat discovered bugs in password re-encryption, key status display, settings
  persistence, or post-password-change login as in scope.

## Verification

- Start or verify Caddy is running from
  `/Users/astrohacker/.config/caddy/Caddyfile`.
- Run `/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`.
- Run `bun run e2e -- account-security-controls.spec.ts` from `webapp/`.
- Run `bun run e2e` from `webapp/` and verify the full suite passes.
- Run `bun run typecheck` from `webapp/`.
- Run `bun run lint` from `webapp/`.
- Run touched-file Prettier checks.
- Run `scripts/build-issues-index.sh` from the repo root.
- Verify the new tests run through Caddy HTTPS `.test` domains and preserve
  real browser WebGPU PoW for account creation/login.
- Verify the negative old-password login mines real WebGPU PoW and fails on the
  login page with the expected error instead of timing out in the success login
  helper.
- Verify settings assertions use durable post-reload selected difficulty labels,
  not only the transient `Saved` status.
- Verify key status assertions are scoped by key row and prove both rotated keys
  remain active after password change.
- Verify no test-only hooks, server-side miners, or fake PoW paths are added.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0006-account-security-controls-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/password.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/keys.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/settings.tsx \
  --context webapp/src/server/user.functions.ts \
  --context webapp/playwright.config.ts \
  "Design review for Issue 42 Experiment 6..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-081902-443688-prompt.md`
- Stdout:
  `logs/claude-review/20260630-081902-443688-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - specify a negative-login path that performs real login PoW and asserts the
    concrete failure signal instead of using the success-only `login()` helper;
  - specify deterministic range-slider interaction and durable
    persisted-after-reload assertions for settings;
  - scope key status assertions to `Key #1` and `Key #2` rows;
  - clarify that the password button relabel is a visible-text improvement;
  - pin the mismatch assertion to the inline `Passwords do not match` text.
- Resolution: this design now includes those selector, timing, and assertion
  mechanics explicitly.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0006-account-security-controls-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/password.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/keys.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/settings.tsx \
  "Follow-up design review for Issue 42 Experiment 6 after required findings were addressed..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-082237-383989-prompt.md`
- Stdout:
  `logs/claude-review/20260630-082237-383989-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Resolution: no additional design changes were required after follow-up
  review.

## Result

Pass.

Implemented account-security E2E coverage in
`webapp/e2e/account-security-controls.spec.ts` and added small accessibility
improvements needed for stable real UI testing:

- password-change fields now have accessible labels for current password, new
  password, and confirmation;
- the password-change submit button now says `Change password`;
- the two PoW settings sliders now have accessible names;
- key rows are exposed as named groups so tests can scope status assertions to
  `Key #1` and `Key #2`.

The new test creates a saved `keypears.test` account, verifies the initial key
state, rotates keys, proves both rotated keys remain active/unlocked, updates
and persists both PoW difficulty sliders, validates password confirmation
errors, changes the account password, verifies the old password is rejected
after real browser login PoW, logs in with the new password, and verifies the
rotated keys still show as active/unlocked.

Verification run on 2026-06-30:

- `/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`
  passed.
- `bun run e2e -- account-security-controls.spec.ts` passed: 1 test.
- `bun run e2e` passed: 7 tests.
- `bun run typecheck` passed.
- `bun run lint` passed with the pre-existing four `oxc(no-map-spread)`
  warnings in `src/server/vault.functions.ts` and
  `src/server/user.functions.ts`.
- `bunx prettier --check e2e/account-security-controls.spec.ts src/routes/_app/_saved/_chrome/password.tsx src/routes/_app/_saved/_chrome/settings.tsx src/routes/_app/_saved/_chrome/keys.tsx`
  passed.
- `scripts/build-issues-index.sh` passed and reported 4 open, 38 closed
  issues.

## Conclusion

Experiment 6 added durable E2E coverage for the account-security controls that
Issue 42 called out: key rotation state, proof-of-work difficulty settings, and
password changes. The coverage uses the existing HTTPS `.test` Playwright
harness and real browser WebGPU PoW, including the negative old-password login
path. No test-only PoW, password, or key bypass was added.

## Completion Review

External Claude review via:

```bash
git diff --staged | python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0006-account-security-controls-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/password.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/keys.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/settings.tsx \
  --context webapp/playwright.config.ts \
  "Completion review for Issue 42 Experiment 6..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-083317-559447-prompt.md`
- Stdout:
  `logs/claude-review/20260630-083317-559447-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Non-blocking findings:
  - avoid a latent settings-test flake where two slider saves could overlap and
    race as last-write-wins;
  - avoid relying on the final transient `Saved` status as durable proof;
  - tighten result wording so the test claims key rows still show
    active/unlocked rather than implying private-key decryption.
- Resolution: the settings test now waits for the first save before changing
  the second slider, relies on the reload persistence assertions for durable
  proof, and the result text now says the rotated keys still show as
  active/unlocked. The targeted spec was rerun after these changes and passed.
