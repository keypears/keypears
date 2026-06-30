# Experiment 3: Same-Domain Messaging Coverage

## Description

Extend the Playwright E2E harness from Experiment 2 to cover encrypted
same-domain messaging between two saved users on `keypears.test`.

This experiment should prove the first major user workflow after account
lifecycle: sender creates a message, recipient receives and reads it, and the
sender can still view their retained sent copy. It should stay single-domain so
the test covers local message encryption/decryption, PoW-gated sending, channel
creation, inbox/channel navigation, and session switching before the issue moves
on to multi-domain federation.

## Changes

- Reuse the E2E environment, Caddy route, `keypears_e2e` database reset, and
  real WebGPU PoW setup from Experiment 2.
- Add or refine Playwright account helpers as needed to support multiple users
  in one test while keeping full UI flows:
  - create and onboard two unique saved accounts on `keypears.test`;
  - log out and log in as either account;
  - confirm the current identity after every account switch by asserting the
    authenticated home page shows the expected full address;
  - create Bob from a logged-out state after Alice is created, because the
    landing page redirects authenticated users away from `/`;
  - either isolate Alice and Bob in separate browser contexts or explicitly use
    logout/login switching and verify that login overwrites the cached
    encryption key by proving the switched user can decrypt their channel;
  - keep generated names within the app's lowercase alphanumeric and length
    rules.
- Add a same-domain messaging E2E spec that:
  - starts from the normal clean E2E database reset;
  - creates Alice and Bob as full saved accounts;
  - logs in as Alice;
  - opens `/send`;
  - enters Bob's full `bob@keypears.test` address;
  - waits for recipient validation to report `Recipient found`;
  - sends a unique text message;
  - performs real browser WebGPU PoW for the send challenge;
  - verifies Alice lands on or can open the channel with Bob and sees the sent
    exact unique message text, proving sender-side retained visibility;
  - logs out and logs in as Bob;
  - verifies Bob's inbox or channel list shows Alice using a contains/`hasText`
    selector rather than an exact accessible-name match, because the link may
    include date and unread count text;
  - verifies Bob's unread badge/count is present before opening the channel;
  - opens the channel with Alice;
  - verifies Bob can decrypt and read the exact unique message text;
  - verifies Bob's unread indicator is cleared after reading by returning to the
    inbox or channel list and asserting the previous unread count is gone where
    the current UI exposes that state.
- Use explicit waits above the default `expect` timeout for message delivery,
  channel-list/inbox polling, and async decryption assertions. Same-domain send
  is synchronous server-side, but the UI updates through polling and effects.
- Keep this experiment focused on text messages only. Vault-secret messages,
  attachments, pagination, and cross-domain delivery belong in later
  experiments.
- Keep the test on `https://keypears.test` through Caddy and do not introduce
  raw localhost browser navigation.
- Do not add a PoW bypass. Message sending must use the same real WebGPU mining
  path as account creation, with the E2E challenge difficulty override applied
  only at challenge issuance.
- If the current UI makes a requested assertion brittle or impossible, prefer a
  small accessibility/selector improvement over test-only hooks. Any such change
  must be user-facing-neutral or accessibility-positive.

## Verification

- Run `caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile`.
- Start Caddy from `~/.config/caddy/Caddyfile` or verify it is already running.
- Run `bun run e2e` from `webapp/` and verify the account lifecycle tests and
  new same-domain messaging tests pass.
- Confirm the passing run uses Playwright-managed Chromium WebGPU through
  `https://keypears.test`.
- Run `bun run typecheck` from `webapp/`.
- Run `bun run lint` from `webapp/`.
- Run touched-file Prettier checks for files changed by this experiment.
- Run `scripts/build-issues-index.sh` from the repo root.
- Verify no production PoW verification, constants, or minimums changed and no
  PoW bypass was added.
- Verify the messaging test asserts:
  - Alice and Bob identity after each account switch;
  - exact unique message text on Alice's retained sender view;
  - unread presence before Bob reads;
  - exact unique message text on Bob's recipient view;
  - unread clearing after Bob reads where exposed by the current UI.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0003-same-domain-messaging-coverage.md \
  --context webapp/e2e/account-lifecycle.spec.ts \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/send.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/inbox.tsx \
  --context 'webapp/src/routes/_app/_saved/channel.$address.tsx' \
  --context webapp/playwright.config.ts \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Design review for Issue 42 Experiment 3. The design extends the Playwright E2E harness to cover same-domain encrypted messaging between two saved users on keypears.test. It must keep real WebGPU PoW, no bypass, Caddy HTTPS routing, and single-domain scope.

Questions:
1. Is the experiment design coherent and scoped correctly after Experiment 2?
2. Are the proposed assertions sufficient to prove sending, receiving, reading, and sender-side retained visibility for same-domain text messages?
3. Are there missing setup, selector, session isolation, polling/timing, or production-safety requirements that must be added before implementation?
4. If acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-065347-386479-prompt.md`
- Stdout:
  `logs/claude-review/20260630-065347-386479-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - assert unread presence before Bob opens the channel, then assert clearing
    after reading;
  - specify user-switch crypto/session isolation and identity assertions;
  - use robust inbox/channel-list selectors and exact unique message text
    assertions;
  - use explicit timeouts for polling and async decryption.
- Resolution: this design now requires before/after unread assertions,
  post-switch identity checks, logged-out account creation ordering, either
  separate contexts or explicit logout/login cache-overwrite verification,
  contains-style channel selectors, exact unique message text assertions, and
  longer waits for polling/decryption.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0003-same-domain-messaging-coverage.md \
  --context webapp/e2e/account-lifecycle.spec.ts \
  --context webapp/e2e/helpers/account.ts \
  --context webapp/src/routes/_app/_saved/_chrome/send.tsx \
  --context webapp/src/routes/_app/_saved/_chrome/inbox.tsx \
  --context 'webapp/src/routes/_app/_saved/channel.$address.tsx' \
  --context webapp/playwright.config.ts \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Follow-up design review for Issue 42 Experiment 3. A prior review requested additions for unread before/after assertions, user-switch crypto/session isolation, robust channel selectors/exact message text, and explicit polling/decrypt timeouts. The experiment design has been revised.

Questions:
1. Are the prior required findings resolved well enough to commit this experiment plan before implementation?
2. Are there any remaining blockers that must change before implementation?
3. If the design is acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-065711-887838-prompt.md`
- Stdout:
  `logs/claude-review/20260630-065711-887838-stdout.json`
- Verdict: **Approved**
- Resolution: no remaining blockers; the plan is approved for implementation.

## Result

Pending.

## Conclusion

Pending.

## Completion Review

Pending.
