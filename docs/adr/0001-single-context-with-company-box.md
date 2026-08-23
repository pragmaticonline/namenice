# Single context with Personal Organization until company box

We keep a single `CONTEXT.md` at the repo root for the entire Namenice domain (domains, DNS, contacts — extensible to future upsells) and model every Account as owning a Personal Organization by default, treated in UI as the individual until the "company" box is ticked, at which point it upgrades to a Company Organization.

A single glossary avoids premature context splits before product boundaries are clear, and the Personal Organization trick lets solo users feel at home (like blognice) without exposing org/membership concepts, while ensuring every Domain and every `org_balances.balance_cents` / `balance_ledger` row remains strictly org-owned (`domains.org_id`, single owner for `example.com`, sub-accounts are `organization_members` via `can(role,cap)` — `viewer` cannot Top-up/Purchase).

## Considered Options

- **Org-less solo mode** — let solo Domains/balances live on Account directly, orgs only for teams. Rejected: splits billing invariants (`UPDATE org_balances SET balance_cents-= ? WHERE balance_cents>=?` + `idempotency_key`) and forces two ownership paths.
- **Multi-context now (`CONTEXT-MAP.md` + `src/<product>/CONTEXT.md`)** — separate Domain/DNS/billing contexts upfront. Rejected: too early, no clear boundaries for upsells; adds mapping cost for one cohesive purchase flow.
- **Always-expose Organization** — show "Organization" to every user from signup. Rejected: leaks team jargon to individuals; blognice pattern proves solo-first wins.

## Consequences

- UI must render Personal Organizations as "Your balance / Your domains" until company box; flip to "Organization" labels after member count >1.
- Every Purchase/Top-up/ledger/API-key/invitation path must carry explicit `org_id` (e.g. `?org=`) — no implicit current-org debit; avoids paying for personal domains from team balance.
- Future upsells add subheadings to the same `CONTEXT.md` until 3+ distinct bounded contexts justify `CONTEXT-MAP.md`.
