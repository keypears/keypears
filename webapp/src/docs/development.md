
## HTTPS with local domains

We use **Caddy** as a reverse proxy and **dnsmasq** for wildcard DNS to access
local apps via real HTTPS domains like `https://keypears.test`.

### Why

- Real HTTPS with green lock (needed for testing crypto APIs, secure cookies)
- Memorable hostnames instead of `localhost:3500`
- Tests all three deployment patterns (primary, subdomain, third-party)

### Install

```bash
brew install caddy
brew install dnsmasq
```

### Configure dnsmasq (one-time)

Resolve all `.test` domains to localhost:

```bash
echo 'address=/test/127.0.0.1' >> /opt/homebrew/etc/dnsmasq.conf
sudo mkdir -p /etc/resolver
echo 'nameserver 127.0.0.1' | sudo tee /etc/resolver/test
sudo brew services start dnsmasq
```

After this, any `*.test` domain resolves to `127.0.0.1` automatically.

### Configure Caddy

Create `~/.caddy/Caddyfile`:

```
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

The `tls internal` directive uses Caddy's built-in local CA instead of Let's
Encrypt. First run installs the root cert in your macOS keychain (prompts for
password once).

Start Caddy:

```bash
caddy start --config ~/.caddy/Caddyfile
```

To reload after config changes:

```bash
caddy reload --config ~/.caddy/Caddyfile
```

## Dev topology

Four domains test three deployment patterns:

| Domain                     | Port | Purpose                                       |
| -------------------------- | ---- | --------------------------------------------- |
| `keypears.test`            | 3500 | Primary self-hosted KeyPears server            |
| `passapples.test`          | 3510 | Astro landing page (subdomain hosting)         |
| `keypears.passapples.test` | 3512 | KeyPears server for passapples domain          |
| `lockberries.test`         | 3520 | Astro landing page (third-party hosted)        |

- **keypears.test** — the main KeyPears server. Address domain and API domain
  are the same.
- **passapples.test** — a business that runs its own KeyPears node on a
  subdomain. The landing page at `passapples.test` has a `keypears.json`
  pointing to `keypears.passapples.test`. Users have `@passapples.test`
  addresses but log in at `keypears.passapples.test`.
- **lockberries.test** — a domain that doesn't run any server. Its
  `keypears.json` points to `keypears.test` as the host. Users have
  `@lockberries.test` addresses but are served by the keypears.test server.

Documentation is served at `/docs/*` by the main webapp itself — there is no
separate docs site.

## Daily workflow

1. Caddy runs in the background (start once per boot, or use `brew services`).
2. From repo root: `bun run dev` — starts all servers via concurrently.
3. Visit `https://keypears.test` — green lock, real HTTPS.

Or run individual servers:

```bash
cd webapp
bun run dev:keypears      # keypears.test on port 3500
bun run dev:passapples    # keypears.passapples.test on port 3512
```

## Useful commands

```bash
caddy start --config ~/.caddy/Caddyfile   # start daemon
caddy stop                                 # stop daemon
caddy reload --config ~/.caddy/Caddyfile   # reload after config change
caddy fmt --overwrite ~/.caddy/Caddyfile   # format Caddyfile
```

## Database

```bash
cd webapp
bun run db:push           # push schema to MySQL (both databases)
bun run db:clear           # drop all tables (both databases)
```

## Testing and linting

```bash
cd webapp
bun run test              # run tests
bun run lint              # run linter (oxlint)
bun run format            # format code (prettier)
```
