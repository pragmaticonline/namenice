# Namenice

Platform for registering and managing domain names and related products (DNS, contacts — extensible to future upsells). Billing is Stripe-primary with an organization-level prepaid balance.

## Language

**Account**: An individual person who signs in via email/password or OAuth (Google/GitHub).
_Avoid_: User, customer

**Organization**: A billing and ownership container for domains and balance. Every domain and every cent of balance belongs to exactly one Organization, not directly to an Account.
_Avoid_: Team, workspace, account (as org)

**Personal Organization**: The default Organization for an Account — sole owner, treated as the individual until the "company" box is ticked. Upgraded to a Company Organization when members are added.
_Avoid_: Personal account, solo workspace

**Company Organization**: An Organization with multiple members after the company box is ticked.
_Avoid_: Team org, business account

**Organization Member**: The link between an Account and an Organization, with a role (`owner | admin | billing | viewer`) checked via `can(role,cap)`.
_Avoid_: Membership, collaborator, member (unqualified)

**Domain**: A registered domain name (e.g. `example.com`) owned by exactly one Organization.
_Avoid_: Name, site, hostname

**DNS Record**: A typed record (`A/AAAA/CNAME/MX/TXT/NS/SRV/CAA/ALIAS`, TTL 60–86400) attached to a Domain.
_Avoid_: Entry, row

**Domain Contact**: WHOIS contact data (registrant/admin/tech) for a Domain, stored via `domain_contacts` and Dynadot.
_Avoid_: Contact info, registrant (unqualified)

**Org Balance**: Prepaid wallet for an Organization (`org_balances.balance_cents`, USD cents) used for purchases and renewals.
_Avoid_: Credits, funds, wallet (unqualified)

**Top-up**: Adding funds to an Org Balance via Stripe Checkout (`POST /billing/topup`, `balance_topup` webhook) within $5–$1000.
_Avoid_: Deposit, recharge, add funds, credit

**Purchase**: Acquiring or renewing a Domain, paid from Org Balance first with Stripe Checkout fallback.
_Avoid_: Buy, order

**Ledger Entry**: Immutable `balance_ledger` row recording a balance movement, keyed by `idempotency_key` and linked to `stripe_events` for exactly-once processing.
_Avoid_: Transaction, log

**API Key**: A scoped, hash-stored credential (`api_keys` with `prefix` + `scopes`) allowing programmatic access on behalf of an Organization.
_Avoid_: Token (unqualified), PAT
