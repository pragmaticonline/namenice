# namenice — modern DNS + domains

Hono on Cloudflare Workers, Better Auth, D1, Analytics Engine (90-day audit).

- **Stripe primary** — all money via Stripe Checkout (`mode=payment` with `price_data`). No stored cards.
- **Custom top-ups** — `$5–$1000` → `POST /billing/topup` → `createTopupCheckoutSession` → `checkout.session.completed metadata.type=balance_topup` → `creditTopup()` (idempotent via `stripe_events` + `balance_ledger.idempotency_key`).
- **Pay from balance** — `POST /domains/buy|renew?pay_from_balance=1` → atomic `UPDATE org_balances SET balance_cents-= ? WHERE balance_cents>=?` + ledger debit.
- **Renewals** — manual or cron debit from balance first, Stripe checkout fallback.
- **Sub-accounts** — `organization_members (owner|admin|billing|viewer)` + `organization_invitations` (7-day token_hash), `can(role,cap)` — port of `blognice memberships`.
- **Audit log** — `EVENTS blob1 LIKE 'audit:%'` 90 days via `auditReport()` (`src/metrics.ts` port of blognice).
- **DNS** — `dns_records (A/AAAA/CNAME/MX/TXT/NS/SRV/CAA/ALIAS, TTL 60–86400)` + `domain_contacts` + nameserver override + `GET/POST /domains/:domain/dns` (validate, list, add, remove, audit).
- **Registrar** — Dynadot REST v2 search/availability via `src/dynadot.ts` (sandbox-aware, `DYNADOT_SANDBOX=true` + `sandbox_` prefix), `POST /domains/search`, Stripe fallback for purchase.
- **Auth** — Better Auth backed by D1/Drizzle (email+password + Google/GitHub), `GET/POST /api/auth/*`, with HttpOnly session cookies.

Run:
```sh
npm install
npm run db:init:local
npm run dev
```

## Deploy

Pushing to `main` runs tests and typecheck in GitHub Actions, then deploys the Worker (`wrangler deploy`) to namenice.net. Tags mark releases; see [CHANGELOG.md](CHANGELOG.md).

Production secrets are set by name only (never commit values):

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put DYNADOT_API_KEY
npx wrangler secret put DYNADOT_API_SECRET
```

Optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN` (audit log), `STRIPE_PORTAL_CONFIGURATION_ID`. Local development uses `.dev.vars` (see [.dev.vars.example](.dev.vars.example)). Initialize a fresh D1 database with `npm run db:init` (`schema.sql` is safe to re-run).

## License

MIT — see [LICENSE](LICENSE).
