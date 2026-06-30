# Experiment 1: Shared Caddy Config

## Description

Establish a shared user-level Caddy configuration for local development and
update KeyPears documentation to use that shared path.

This experiment intentionally does not add Playwright tests yet. Its goal is to
make the HTTPS domain routing stable first, so later Playwright experiments can
run against the same `.test` domains a developer uses manually.

## Changes

- Inventory the current Caddy state before writing the shared config:
  - check `brew services list` for Caddy run mode;
  - check `~/.caddy/Caddyfile`, `~/.config/caddy/Caddyfile`, and
    `/opt/homebrew/etc/Caddyfile`;
  - inspect `~/.config/caddy/autosave.json` for existing routes that would be
    lost by switching config files.
- Record the inventory result in this experiment file before marking the result.
- Create or update `~/.config/caddy/Caddyfile` with all current KeyPears local
  development routes:
  - `keypears.test` -> `localhost:3500`;
  - `passapples.test` -> `localhost:3510`;
  - `keypears.passapples.test` -> `localhost:3512`;
  - `lockberries.test` -> `localhost:3520`.
- Preserve existing non-KeyPears local routes. On this machine, the live
  autosave state contains TermSurf routes and `~/dev/termsurf-com/dev/Caddyfile`
  exists, so the intended implementation is to place
  `import /Users/astrohacker/dev/termsurf-com/dev/Caddyfile` at the top of the
  shared Caddyfile and then add the KeyPears routes below it. This reads the
  TermSurf config without modifying the TermSurf repository.
- Use Caddy's local TLS behavior suitable for `.test` browser workflows.
- Update `webapp/src/docs/development.md` so it documents
  `~/.config/caddy/Caddyfile` instead of `~/.caddy/Caddyfile`.
- Document validate, format, start, reload, and stop commands for the shared
  path.
- Clarify that `/opt/homebrew/etc/Caddyfile` is the Homebrew service-managed
  alternative, while `~/.config/caddy/Caddyfile` is the default user-run dev
  config. Ground the documented commands in the observed run mode.
- Do not modify `~/dev/termsurf-com`.

## Verification

- Run the Caddy inventory commands and record the observed config/run-mode state
  in `## Result`.
- Run `caddy fmt --overwrite ~/.config/caddy/Caddyfile`.
- Run `caddy validate --config ~/.config/caddy/Caddyfile`.
- Start or reload Caddy from `~/.config/caddy/Caddyfile` according to the
  observed run mode.
- Probe the KeyPears routes through Caddy:
  - `curl -k -sI https://keypears.test`;
  - `curl -k -sI https://passapples.test`;
  - `curl -k -sI https://keypears.passapples.test`;
  - `curl -k -sI https://lockberries.test`.
- Probe at least one preserved TermSurf route through Caddy, such as
  `curl -k -sI https://termsurf.test`.
- Run `rg -n "~/.caddy/Caddyfile" webapp/src/docs/development.md` and verify it
  returns no matches.
- Run
  `rg -n "~/.config/caddy/Caddyfile|/opt/homebrew/etc/Caddyfile" webapp/src/docs/development.md issues/0042-global-caddy-and-playwright-coverage`.
- Run `git -C ~/dev/termsurf-com status --short` and verify this work did not
  modify TermSurf.
- Run `scripts/build-issues-index.sh`.

## Design Review

Mode: `external-claude` via `claude-review`.

First review:

- Command:
  `python3 skills/claude-review/scripts/claude_review.py --context issues/0042-global-caddy-and-playwright-coverage/README.md --context issues/0042-global-caddy-and-playwright-coverage/exp-0001-shared-caddy-config.md "...design gate..."`
- Session: `f196ffea-7452-4490-bfbe-d9622967a963`
- Prompt: `logs/claude-review/20260630-061151-144541-prompt.md`
- Output: `logs/claude-review/20260630-061151-144541-stdout.json`
- Verdict: `CHANGES REQUIRED`
- Required findings:
  - inventory the currently-running Caddy config before writing the shared
    config;
  - preserve existing non-KeyPears routes rather than only preserving routes if
    `~/.config/caddy/Caddyfile` already exists;
  - add live route verification after Caddy start or reload;
  - ground the user-run versus Homebrew-service guidance in the observed run
    mode.
- Resolution: updated the design to inventory candidate config paths, inspect
  autosave state, preserve TermSurf routes with a read-only import, run live
  HTTPS probes, assert doc path migration, and choose commands according to the
  observed run mode.

Follow-up review:

- Command:
  `python3 skills/claude-review/scripts/claude_review.py --context issues/0042-global-caddy-and-playwright-coverage/README.md --context issues/0042-global-caddy-and-playwright-coverage/exp-0001-shared-caddy-config.md "...follow-up design review..."`
- Session: `f196ffea-7452-4490-bfbe-d9622967a963`
- Prompt: `logs/claude-review/20260630-061430-266826-prompt.md`
- Output: `logs/claude-review/20260630-061430-266826-stdout.json`
- Verdict: `APPROVED`
- Required findings: none.

## Result

Pass.

Inventory:

- `brew services list | rg -n "caddy|Name"` showed `caddy none`; Caddy was not
  running as a Homebrew service.
- `~/.caddy/Caddyfile`, `~/.config/caddy/Caddyfile`, and
  `/opt/homebrew/etc/Caddyfile` were all absent before this experiment.
- `~/.config/caddy/autosave.json` contained existing TermSurf routes:
  `termsurf.test`, `cloud.termsurf.test`, `termsurf2.test`, and
  `cloud.termsurf2.test`.
- `git -C /Users/astrohacker/dev/termsurf-com status --short` produced no output
  before and after the change.

Created `~/.config/caddy/Caddyfile`:

```caddyfile
import /Users/astrohacker/dev/termsurf-com/dev/Caddyfile

keypears.test {
	tls internal
	reverse_proxy localhost:3500
}

passapples.test {
	tls internal
	reverse_proxy localhost:3510
}

keypears.passapples.test {
	tls internal
	reverse_proxy localhost:3512
}

lockberries.test {
	tls internal
	reverse_proxy localhost:3520
}
```

Updated `webapp/src/docs/development.md` to use `~/.config/caddy/Caddyfile`,
document optional shared Caddyfile imports, describe
`/opt/homebrew/etc/Caddyfile` as the Homebrew service-managed alternative, and
list validate, format, foreground run, background start, reload, and stop
commands.

Verification:

- `caddy fmt --overwrite ~/.config/caddy/Caddyfile` passed.
- `caddy validate --config ~/.config/caddy/Caddyfile` passed.
- `caddy run --config ~/.config/caddy/Caddyfile` ran successfully in the
  foreground and served the shared config.
- `lsof -nP -iTCP:443 -iTCP:80 -sTCP:LISTEN` showed Caddy listening on both
  ports while running.
- `curl -s http://localhost:2019/config/apps/http/servers/srv0/routes | jq 'length'`
  returned `8`, covering the four imported TermSurf routes plus the four
  KeyPears routes.
- HTTPS probes reached Caddy for all required hosts:
  - `https://keypears.test` returned `HTTP/2 502`;
  - `https://passapples.test` returned `HTTP/2 502`;
  - `https://keypears.passapples.test` returned `HTTP/2 502`;
  - `https://lockberries.test` returned `HTTP/2 502`;
  - `https://termsurf.test` returned `HTTP/2 502`.
- The `502` responses are expected because the upstream dev servers were not
  running. They prove DNS, TLS, host matching, and reverse-proxy routing reached
  Caddy.
- `rg -n "~/.caddy/Caddyfile" webapp/src/docs/development.md` returned no
  matches.
- `rg -n "~/.config/caddy/Caddyfile|/opt/homebrew/etc/Caddyfile" webapp/src/docs/development.md issues/0042-global-caddy-and-playwright-coverage`
  showed the new shared path and service-managed alternative.
- `scripts/build-issues-index.sh` reported `4 open, 38 closed`.

Additional note:

- `caddy start --config ~/.config/caddy/Caddyfile --pidfile /tmp/keypears-caddy.pid`
  starts and listens in this environment, but the process can exit after the
  non-interactive shell closes its output pipe.
  `caddy run --config ~/.config/caddy/Caddyfile` was stable for verification, so
  the docs now make foreground `run` the default user-run command and keep
  background `start` as an option.
- `prettier --write webapp/src/docs/development.md` could not run from the repo
  root because `prettier-plugin-tailwindcss` is not installed in this checkout.
  `webapp/node_modules` is absent. The Markdown edit was kept manually wrapped.

## Conclusion

Experiment 1 established `~/.config/caddy/Caddyfile` as the shared user-level
Caddy configuration for local development. The shared config imports the
existing TermSurf Caddyfile without changing the TermSurf repository and adds
all four KeyPears local domains.

KeyPears development docs now point at the shared Caddyfile path and explain the
foreground user-run flow, background start option, and Homebrew service-managed
alternative. Live Caddy probes confirmed that all KeyPears routes and at least
one preserved TermSurf route reach Caddy over HTTPS.

## Completion Review

Mode: `external-claude` via `claude-review`.

First review:

- Command:
  `python3 skills/claude-review/scripts/claude_review.py --context issues/0042-global-caddy-and-playwright-coverage/README.md --context issues/0042-global-caddy-and-playwright-coverage/exp-0001-shared-caddy-config.md --context webapp/src/docs/development.md "...completion review..."`
- Session: `f196ffea-7452-4490-bfbe-d9622967a963`
- Prompt: `logs/claude-review/20260630-062106-609960-prompt.md`
- Output: `logs/claude-review/20260630-062106-609960-stdout.json`
- Verdict: `CHANGES REQUIRED`
- Required finding:
  - `webapp/src/docs/development.md` showed
    `import /Users/astrohacker/dev/termsurf-com/dev/Caddyfile` in the default
    public example, which would fail for developers without that local path and
    leaked an unrelated project path into the KeyPears docs.
- Resolution: changed the default docs example to KeyPears-only routes and moved
  shared-project imports into a separate optional placeholder example:
  `import /path/to/other-project/Caddyfile`.

Follow-up review:

- Command:
  `python3 skills/claude-review/scripts/claude_review.py --context issues/0042-global-caddy-and-playwright-coverage/README.md --context issues/0042-global-caddy-and-playwright-coverage/exp-0001-shared-caddy-config.md --context webapp/src/docs/development.md "...follow-up completion review..."`
- Session: `f196ffea-7452-4490-bfbe-d9622967a963`
- Prompt: `logs/claude-review/20260630-062241-312092-prompt.md`
- Output: `logs/claude-review/20260630-062241-312092-stdout.json`
- Verdict: `APPROVED`
- Required findings: none.
