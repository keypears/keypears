
Any domain can run a KeyPears server. This guide covers the requirements,
configuration, and setup.

## Requirements

- **Runtime**: Bun
- **Database**: MySQL
- **Reverse proxy**: Caddy (recommended) or any HTTPS-capable proxy
- **DNS**: Control of your domain's DNS records

## Environment variables

| Variable             | Description                                        | Example                |
| -------------------- | -------------------------------------------------- | ---------------------- |
| `KEYPEARS_DOMAIN`    | Address domain (goes after `@` in user addresses)  | `acme.com`             |
| `KEYPEARS_API_DOMAIN`| Where this server's API runs                       | `keypears.acme.com`    |
| `DATABASE_URL`       | MySQL connection string                            | `mysql://user:pass@localhost:3306/keypears` |
| `KEYPEARS_SECRET`    | Master secret for PoW signing keys (64-char hex)   | `a3b4c5...`            |

For self-hosted deployments where the address domain and API domain are the
same, set both `KEYPEARS_DOMAIN` and `KEYPEARS_API_DOMAIN` to the same value.

## Database setup

Push the schema to MySQL:

```bash
bun run db:push
```

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

The server listens on the configured port. Caddy handles TLS termination and
proxies requests to the server.

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
