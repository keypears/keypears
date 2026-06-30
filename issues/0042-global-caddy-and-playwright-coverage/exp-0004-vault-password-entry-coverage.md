# Experiment 4: Vault Password Entry Coverage

## Description

Extend the Playwright E2E harness to cover the local vault/password-entry
workflow for a saved `keypears.test` account.

This experiment should prove that a user can save password-style secrets,
decrypt and inspect them, search for them, edit them, and delete them through
the UI. It should stay single-account and single-domain so the scope remains
focused on local vault behavior before later experiments cover password changes,
key management, shared secret messages, or federation.

## Changes

- Reuse the E2E environment, Caddy route, one-worker Playwright configuration,
  `keypears_e2e` database reset, and real WebGPU account setup from prior
  experiments.
- Add or refine Playwright helpers as needed for authenticated account setup and
  stable vault selectors.
- Add accessibility-positive labels needed for reliable real-UI testing:
  - associate labels with the create-entry inputs for username, email, password,
    and notes using `htmlFor`/`id` or `aria-label`;
  - associate labels with the edit-entry inputs for name, search terms, domain,
    username, email, password, and notes using `htmlFor`/`id` or `aria-label`;
  - give the password reveal toggle a distinct accessible name;
  - give the entry-level action menu trigger a distinct accessible name such as
    `Entry actions`;
  - give version/history action menu triggers distinct accessible names so they
    cannot be confused with the entry-level menu.
- Add a vault E2E spec that:
  - creates and onboards one saved user on `keypears.test`;
  - opens `/vault`;
  - creates a new `Login` entry with unique values for name, search terms,
    domain, username, email, password, and notes;
  - verifies navigation to the detail page after save;
  - verifies visible metadata such as name, domain, username, email, and notes;
  - reveals the password and verifies the exact saved password text;
  - returns to `/vault`, searches by a unique search term, and verifies the
    entry appears;
  - opens the entry from search results;
  - edits at least the name, search terms, username, password, and notes;
  - verifies updated plaintext metadata and encrypted values;
  - reveals the password again after save, because the detail view re-masks it
    after navigation to the new version;
  - verifies the history/version section after edit, when an older version
    exists, by asserting the actual history control such as `History (1 version)`
    and/or the current version marker;
  - deletes the entry through the normal entry-level action menu and confirmation
    flow, not a per-version history menu;
  - verifies the entry no longer appears in the vault list or search results.
- Wait on decrypted field values instead of loading states such as
  `Loading keys...`. Vault CRUD itself does not require PoW beyond account setup,
  but encrypted field rendering is asynchronous.
- Prefer user-facing-neutral accessibility improvements for brittle selectors.
  Do not add test-only hooks.
- Keep the experiment focused on login/password entries. Text-only entries,
  shared secret messages, restore-history behavior, password changes, and locked
  old-key behavior belong in later experiments.
- Do not change vault encryption semantics except to fix bugs directly surfaced
  by the E2E test.

## Verification

- Start Caddy from `~/.config/caddy/Caddyfile` or verify it is already running.
- Run `bun run e2e` from `webapp/` and verify account lifecycle, same-domain
  messaging, and the new vault password-entry tests pass.
- Run `bun run typecheck` from `webapp/`.
- Run `bun run lint` from `webapp/`.
- Run touched-file Prettier checks for files changed by this experiment.
- Run `scripts/build-issues-index.sh` from the repo root.
- Verify vault tests use the real UI and encrypted vault functions, with no
  test-only hooks or direct database setup.
- Verify create/edit form fields, password reveal, entry actions, and version
  actions have distinct accessible names.
- Verify the edit step re-reveals the password before asserting the updated
  password value.
- Verify the history assertion happens only after edit creates an older version.
- Verify delete uses the entry-level delete action and removes the secret from
  both the full list and search results.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0004-vault-password-entry-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/vault.tsx \
  --context 'webapp/src/routes/_app/_saved/vault.$id.tsx' \
  --context webapp/src/server/vault.functions.ts \
  --context webapp/playwright.config.ts \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Design review for Issue 42 Experiment 4. The design extends the Playwright E2E harness to cover local vault/password-entry CRUD for a saved keypears.test account. It must use the real UI and encrypted vault functions, with no test-only hooks.

Questions:
1. Is the experiment design coherent and scoped correctly after Experiments 2 and 3?
2. Are the proposed assertions sufficient to prove create, inspect/decrypt, search, edit, and delete for login/password vault entries?
3. Are there missing selector, route, version/history, deletion, encryption-key, or timing requirements that must be added before implementation?
4. If acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-071048-749376-prompt.md`
- Stdout:
  `logs/claude-review/20260630-071048-749376-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - add accessible labels for create/edit username, email, password, and notes
    fields, and include edit-form name, search terms, and domain labels because
    the test edits those fields;
  - add distinct accessible names for password reveal, entry actions, and
    version actions;
  - make history assertions explicitly happen after edit creates an older
    version;
  - re-reveal the password after editing before asserting the updated value;
  - wait on decrypted values rather than loading states.
- Resolution: this design now requires those accessibility additions, explicit
  post-edit history assertions, password re-reveal after save, decrypted-value
  waits, and entry-level delete disambiguation.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0004-vault-password-entry-coverage.md \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/vault.tsx \
  --context 'webapp/src/routes/_app/_saved/vault.$id.tsx' \
  --context webapp/src/server/vault.functions.ts \
  --context webapp/playwright.config.ts \
  "Follow-up design review for Issue 42 Experiment 4 after required findings were addressed..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-074003-833564-prompt.md`
- Stdout:
  `logs/claude-review/20260630-074003-833564-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Resolution: the design now explicitly includes create/edit field labels,
  including edit-form name, search terms, and domain labels; distinct action
  control names; post-edit history assertions; password re-reveal after edit;
  decrypted-value waits; and entry-level delete disambiguation.

## Result

Pass.

Implemented vault login-entry E2E coverage through the real UI and encrypted
vault functions. The new spec creates a saved `keypears.test` account, creates
a login entry with unique metadata and encrypted secret fields, verifies
decrypted values after navigation, searches for the entry, edits it, verifies
the updated decrypted values, checks the post-edit history control, reveals the
updated password after save, deletes the entry through the entry-level actions
menu, and verifies the entry is gone from both the full vault list and search
results.

The implementation also made existing visible vault labels programmatically
associated with their fields and gave icon-only controls distinct accessible
names:

- create-entry labels now target name, search terms, domain, username, email,
  password, and notes inputs;
- edit-entry labels now target name, search terms, domain, username, email,
  password, and notes inputs;
- the password reveal toggle is named `Show password` / `Hide password`;
- the entry-level actions trigger is named `Entry actions`;
- version action triggers are named by version, such as
  `Version 1 actions`.

Verification run:

```text
/opt/homebrew/bin/caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile
Valid configuration

bun run e2e -- vault-password-entry.spec.ts
1 passed

bun run e2e
4 passed

bun run typecheck
tsc --noEmit

bun run lint
Found 4 warnings and 0 errors.

bunx prettier --check e2e/vault-password-entry.spec.ts src/routes/_app/_saved/_chrome/vault.tsx 'src/routes/_app/_saved/vault.$id.tsx'
All matched files use Prettier code style!

scripts/build-issues-index.sh
issues/README.md: 4 open, 38 closed
```

The lint warnings are pre-existing `no-map-spread` warnings in
`src/server/vault.functions.ts` and `src/server/user.functions.ts`.

## Conclusion

Experiment 4 passes. The Playwright suite now covers account lifecycle,
same-domain messaging, and vault login-entry CRUD against the local HTTPS
domain with real browser WebGPU proof-of-work for account setup. The vault test
uses accessibility-positive selectors and exercises the encrypted vault path
without test-only hooks.

## Completion Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0004-vault-password-entry-coverage.md \
  --context webapp/e2e/vault-password-entry.spec.ts \
  --context webapp/src/routes/_app/_saved/_chrome/vault.tsx \
  --context 'webapp/src/routes/_app/_saved/vault.$id.tsx' \
  "Completion review for Issue 42 Experiment 4..."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-074555-310308-prompt.md`
- Stdout:
  `logs/claude-review/20260630-074555-310308-stdout.json`
- Verdict: **Approved**
- Required findings: none.
- Non-blocking notes:
  - `getByText("v2", { exact: false })` is loose, but corroborated by the
    exact `History (1 version)` assertion.
  - Text-entry textarea labels and copy-button naming can be improved in future
    text-entry or copy-control coverage.
- Resolution: no implementation changes were required after completion review.
