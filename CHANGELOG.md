# Changelog

## 1.0.0 — 2026-11-17

First stable release of the Namenice Worker (namenice.net).

- Domain search with live Dynadot registrar quotes plus RDAP verification, across popular extensions and name ideas.
- Purchase and renewal via Stripe Checkout or prepaid Organization balance, with balance-first auto-renewal cron and refund on registrar failure.
- Better Auth sign-in (email/password, optional Google/GitHub) with Personal/Company Organizations, member roles, and invitations.
- DNS record management, domain contacts, nameserver override, transfers in/out, WHOIS privacy, and DNSSEC controls.
- Scoped API keys (`/api/v1/domains`, `/api/v1/domains/:domain/dns`), signed outbound webhooks, CLI (`bin/namenice.mjs`), and 90-day Analytics Engine audit log.
- Hardening: production now fails closed when `BETTER_AUTH_SECRET` is missing or left at the development default; `schema.sql` is safe to re-run (`IF NOT EXISTS`).

### Known limitations

- Legacy design-pack bundles under `public/assets/js/` (`search.js`, `homepage.js`, `transfer.js`, `cart.js`, `checkout.js`, `component-lab.js` and `mocks/`) are not linked from any live page — live pages are server-rendered — and are kept only for design reference.
- The Terraform provider under `terraform-provider-namenice/` is released separately and is not part of this Worker release.
