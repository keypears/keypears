Any domain can run a KeyPears server. This guide covers the requirements,
configuration, and setup.

## Requirements

- **Runtime**: Bun
- **Database**: MySQL
- **Reverse proxy**: Caddy (recommended) or any HTTPS-capable proxy
- **DNS**: Control of your domain's DNS records

## Environment variables

| Variable              | Description                                                                                                                                                | Example                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `KEYPEARS_DOMAIN`     | Address domain (goes after `@` in user addresses)                                                                                                          | `acme.com`                                  |
| `KEYPEARS_API_DOMAIN` | Where this server's API runs                                                                                                                               | `keypears.acme.com`                         |
| `DATABASE_URL`        | MySQL connection string                                                                                                                                    | `mysql://user:pass@localhost:3306/keypears` |
| `KEYPEARS_SECRET`     | Master secret for PoW signing keys (64-char hex)                                                                                                           | `a3b4c5...`                                 |
| `KEYPEARS_ADMIN`      | (Optional) KeyPears address allowed to claim this server's primary domain as admin. When unset, the primary domain is not automatically claimable. See [Claiming your primary domain](#claiming-your-primary-domain). | `ryan@acme.com`                             |

For self-hosted deployments where the address domain and API domain are the
same, set both `KEYPEARS_DOMAIN` and `KEYPEARS_API_DOMAIN` to the same value.

## Database setup

Push the schema to MySQL using Drizzle Kit with your deployment's env file:

```bash
cd webapp
dotenvx run -f .env.production -- drizzle-kit push
```

(The repo's `bun run db:push` script is dev-only — it uses `.env.dev` and
`.env.dev.passapples` to push to both local dev databases.)

This creates all required tables. The schema uses UUIDv7 binary primary keys,
`datetime` columns, and `varbinary` for encrypted data.

## keypears.json

Serve a `keypears.json` file at your domain's well-known path:

```
https://acme.com/.well-known/keypears.json
```

```json
{
  "apiDomain": "keypears.acme.com"
}
```

For subdomain deployments, the `apiDomain` points to the subdomain. For
self-hosted deployments where the app serves the domain directly, `apiDomain` is
the domain itself.

## Reverse proxy (Caddy)

Caddy provides automatic HTTPS. A minimal Caddyfile for a subdomain deployment:

```
keypears.acme.com {
    reverse_proxy localhost:3500
}
```

## Running the server

```bash
bun install
bun run build
bun run start
```

The build step compiles the whitepaper with [Typst](https://typst.app) and
builds the blog before running `vite build`, so Typst must be installed
(`brew install typst` on macOS, or see the Typst installation docs). The
server listens on the configured port. Caddy handles TLS termination and
proxies requests to the server.

## Claiming your primary domain

To administer your own server — create users for your domain, reset passwords,
toggle open registration, use the `/domains` page — you need to be a verified
admin of the primary domain. This is the same mechanism third-party hosted
domains use (see below), applied to your own server.

Set the `KEYPEARS_ADMIN` environment variable to a KeyPears address you
already own — it can be an address on your own server (e.g.
`ryan@acme.com`) or a federated address on a different server
(e.g. `ryan@ryanxcharles.com`). When set, the server includes that address
in its `/.well-known/keypears.json` response:

```json
{
  "apiDomain": "acme.com",
  "admin": "ryan@acme.com"
}
```

Then, logged in as that address, visit `/domains` and click Claim. The
claim flow fetches the json, verifies the `admin` field matches the
caller, and records you as the verified admin of your primary domain.
From that point on you can use `/domains` to create users, reset
passwords, and manage your domain's registration settings.

### Why this is opt-in

`KEYPEARS_ADMIN` is deliberately optional and has no default. A fresh
deployment advertises no admin and the primary domain is not
automatically claimable — this eliminates a race where an attacker
watching a public deployment could beat the operator to registering a
default admin name (e.g. `admin@yourdomain.com`) and gain admin
control of a domain they don't own. You explicitly opt in by setting
the env var to an address you already control.

### Workflow

1. Deploy the server as usual, with `KEYPEARS_ADMIN` unset (or
   commented out in your env file).
2. Create an account on the running server with the address you want
   to use as admin. If you want `ryan@acme.com`, sign up as `ryan` on
   your own server. If you want a federated address, sign up on
   whichever server hosts it.
3. Set `KEYPEARS_ADMIN=<your-address>` in your env file (e.g.
   `webapp/.env.prod`).
4. Redeploy. The `/.well-known/keypears.json` response now includes
   the `admin` field.
5. Log in as that address, visit `/domains`, click Claim on your
   primary domain. You're the verified admin.

Changing admin later is symmetric: update the env var, redeploy, and
the new admin address can claim. The old admin remains the recorded
admin in the database until the new claim completes.

## Domain claiming (third-party hosting)

If you want to host users for a domain you don't directly serve, the domain
owner adds an `admin` field to their `keypears.json`:

```json
{
  "apiDomain": "keypears.com",
  "admin": "your-admin-user@keypears.com"
}
```

The admin can then create users and reset passwords for that domain through the
KeyPears interface. Admin identity is verified against `keypears.json` on every
privileged action.
