If you own a domain but don't run your own KeyPears server, you can still use
your domain for KeyPears addresses. Your users are hosted on an existing
server (e.g. `keypears.com`), but their addresses use your domain
(e.g. `alice@yourdomain.com`).

## How it works

The domain owner hosts a `keypears.json` file at their domain's well-known
path. This file tells the KeyPears network which server handles API requests
for the domain, and which KeyPears address is authorized to administer it.

```
https://yourdomain.com/.well-known/keypears.json
```

```json
{
  "apiDomain": "keypears.com",
  "admin": "you@keypears.com"
}
```

The `apiDomain` points to the server that hosts your users. The `admin` field
is the KeyPears address allowed to manage the domain — create users, reset
passwords, and toggle registration settings.

## Claiming your domain

1. **Create an account on the hosting server.** For example, sign up as
   `you@keypears.com`.
2. **Host `keypears.json` on your domain** with that account as `admin`.
3. **Claim the domain.** Log in as `you@keypears.com`, visit `/domains`,
   enter your domain, and click Claim. The server fetches your
   `keypears.json`, verifies the `admin` field matches your address, and
   records you as the domain admin.

You can now create users and manage your domain from the `/domains` page.

## Admin verification

Admin identity is verified against `keypears.json` on every privileged
action — not just at claim time. If you remove or change the `admin` field,
the previous admin loses access immediately.

## Bootstrapping a self-administered domain

When you first claim a domain, the admin address must already exist — so it
will typically live on the hosting server (e.g. `you@keypears.com`). Once
claimed, you can transfer admin to an address at your own domain so the admin
identity is local:

1. **Claim the domain** using an account on the hosting server (steps above).
2. **Create an admin account on the new domain.** Use the domain management
   panel to create a user (e.g. `you@yourdomain.com`).
3. **Update `keypears.json`** to point `admin` at the new address:
   ```json
   {
     "apiDomain": "keypears.com",
     "admin": "you@yourdomain.com"
   }
   ```
4. **Re-claim the domain.** Log in as `you@yourdomain.com`, visit `/domains`,
   and claim the same domain again. The claim flow updates the admin to
   your new address.

Your domain is now self-administered — the admin is an address at the domain
itself, not an account on a different server.
