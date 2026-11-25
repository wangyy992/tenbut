# Deploy TEN BUT to your Cloudflare account

In Workers Builds, import this repository and use:

- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Worker name: `tenbut` (must match `wrangler.jsonc`)

The build generates `dist/server/wrangler.json` and a `.wrangler/deploy/config.json`
pointer, so Wrangler deploys the built server and client assets rather than raw
TypeScript source. The original Sites build stays separate.

The `DB` D1 binding has no account-specific ID. Wrangler automatically provisions
or reuses the linked `tenbut-rooms` database at deployment. The build token needs
Workers Scripts Edit and D1 Edit permissions. If provisioning fails with an
authorization error, update the token permissions or create a D1 database in the
dashboard and add its database ID to `wrangler.jsonc`.

The standalone Worker initializes the existing rooms schema on the first game API
request with `CREATE TABLE IF NOT EXISTS`; it never deletes an existing table.
No migrations need to be run manually for this initial schema. Later schema
changes should use explicit D1 migrations.

Room data in your Cloudflare account is separate from the existing Sites database.
Players should create fresh rooms on this deployment.

For a public URL that excludes account names, use an independent custom domain or
choose a non-personal workers.dev account subdomain in the Cloudflare dashboard.
Renaming the repository alone does not change the account-level workers.dev suffix.

Local checks:

```sh
npm ci
npx tsc --noEmit
node tests/run-local.mjs
npm run build:cloudflare
npx wrangler deploy --dry-run
```
