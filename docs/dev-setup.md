# Local Development Setup

## HTTPS with Local Domains

We use **Caddy** as a reverse proxy and **dnsmasq** for wildcard DNS to
access local apps via real HTTPS domains like `https://keypears.test`.

### Why

- Real HTTPS with green lock (needed for testing crypto APIs, secure cookies)
- Memorable hostnames instead of `localhost:3001`
- One setup handles all local projects

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
  reverse_proxy localhost:3001
}
```

The `tls internal` directive uses Caddy's built-in local CA instead of
Let's Encrypt. First run installs the root cert in your macOS keychain
(prompts for password once).

Start Caddy:

```bash
caddy start --config ~/.caddy/Caddyfile
```

To add a new app, add a block to the Caddyfile and reload:

```bash
caddy reload --config ~/.caddy/Caddyfile
```

### Vite Configuration

Vite 8+ blocks requests from unknown hostnames. Add the local domain to
`server.allowedHosts` in `vite.config.ts`:

```ts
server: {
  port: 3001,
  allowedHosts: ["keypears.test"],
},
```

### Daily Workflow

1. Caddy runs in the background (start once per boot, or use `brew services`)
2. `cd webapp && bun dev` — starts TanStack on port 3001
3. Visit `https://keypears.test` — green lock, real HTTPS

### Useful Commands

```bash
caddy start --config ~/.caddy/Caddyfile   # start daemon
caddy stop                                 # stop daemon
caddy reload --config ~/.caddy/Caddyfile   # reload after config change
caddy fmt --overwrite ~/.caddy/Caddyfile   # format Caddyfile
```
