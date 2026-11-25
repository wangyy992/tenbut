# Deploy TEN BUT to your Cloudflare account

## Analytics and post-round voice discussion

After deploying, add an encrypted runtime secret `ADMIN_PASSWORD` of at least 16
characters in Worker Settings > Variables and Secrets. Do not put it in the repo.
Visit `/admin` and enter any username plus that password in the browser login
prompt. Without the secret the dashboard remains disabled. Incorrect attempts
are limited to 10 per 15 minutes by a salted, hashed network identifier; raw IP
addresses are not stored. Do not reuse your Cloudflare or GitHub password.

Analytics starts at this version, using an anonymous first-party cookie lasting
one year. Opens are page navigations (React remounts are deduplicated), visitors
are distinct browser identifiers, users successfully create/join a game room,
and daily totals use UTC+8. It does not reconstruct historical traffic, identify
real people, or exclude every bot. No nicknames, clues, raw IPs, or audio are
stored in analytics. `/api/admin` exposes the same aggregates behind the same
authentication.

Voice is optional and available only during the results phase. Each participant
must click Join and allow microphone access. Mute/leave are available; changing
rounds or leaving unmounts the voice component and stops microphone tracks. A
polling authorization/phase failure also stops the microphone. Audio is WebRTC
peer-to-peer and is not recorded. Participants may see each other's network
addresses. Cloudflare D1 stores short-lived signaling only, cleaned after 60s;
presence expires in 15s without heartbeats. Up to 12 room members can join, but
full-mesh bandwidth requirements grow with room size; test on target devices.

Default ICE configuration uses Cloudflare's public STUN service. Networks with
restrictive NAT/firewalls may fail without TURN. An optional runtime secret
`RTC_ICE_SERVERS` accepts a JSON array of standard RTCIceServer objects for your
own TURN service. These scoped TURN credentials are sent only to authenticated
voice participants; never put a Cloudflare account token in this field. Prefer
short-lived credentials. No paid relay service is provisioned automatically.
Test with two real devices on different networks; build/unit tests cannot prove
microphone permission, autoplay, or cross-network audio works.

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
