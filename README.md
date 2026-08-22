# namenice — modern DNS + domains

Hono on Cloudflare Workers, Better Auth, D1, Analytics Engine (90-day audit).

- **Stripe primary** — all money via Stripe Checkout (`mode=payment` with `price_data`). No stored cards.
- **Custom top-ups** — `$5–$1000` → `POST /billing/topup` → `createTopupCheckoutSession` → `checkout.session.completed metadata.type=balance_topup` → `creditTopup()` (idempotent via `stripe_events` + `balance_ledger.idempotency_key`).
- **Pay from balance** — `POST /domains/buy|renew?pay_from_balance=1` → atomic `UPDATE org_balances SET balance_cents-= ? WHERE balance_cents>=?` + ledger debit (blognice `schema.sql:189` membership clone for roles).
- **Renewals** — manual or cron debit from balance first, Stripe checkout fallback.
- **Sub-accounts** — `organization_members (owner|admin|billing|viewer)` + `organization_invitations` (7-day token_hash), `can(role,cap)` — port of `blognice memberships`.
- **Audit log** — `EVENTS blob1 LIKE 'audit:%'` 90 days via `auditReport()` (`src/metrics.ts` port of blognice).

Run:
\`\`\`sh
npm install
npm run db:init:local
npm run dev
\`\`\`
