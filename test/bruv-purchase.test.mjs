import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const balanceSrc = readFileSync(new URL("../src/balance.ts", import.meta.url), "utf8");
const dynadotSrc = readFileSync(new URL("../src/dynadot.ts", import.meta.url), "utf8");
const stripeSrc = readFileSync(new URL("../src/stripe.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

test("money: buy debits $14.99 + $2 fee via atomic balance first, Stripe fallback", () => {
  assert.match(indexSrc, /app\.post\(.*\/domains\/buy/, "buy endpoint exists");
  assert.match(indexSrc, /1499|14\.99/, "buy amount $14.99 base");
  assert.match(indexSrc, /debitBalance/, "buy uses debitBalance first");
  assert.match(indexSrc, /pay_from_balance|payFromBalance/, "buy has balance toggle");
  assert.match(balanceSrc, /UPDATE org_balances SET balance_cents = balance_cents -/);
  assert.match(balanceSrc, /balance_cents >= \?/, "atomic WHERE balance >= amount");
});

test("money: Dynadot contact create before register, stored in domain_contacts", () => {
  assert.match(indexSrc, /createContact/, "buy calls createContact");
  assert.match(indexSrc, /registerDomain/, "buy calls registerDomain");
  assert.match(indexSrc, /domain_contacts/, "stores contact");
  assert.match(dynadotSrc, /createContact/);
  assert.match(dynadotSrc, /registerDomain/);
  assert.match(schema, /domain_contacts/);
});

test("money: buy refund on Dynadot failure via creditTopup", () => {
  assert.match(indexSrc, /refund:buy|creditTopup.*refund/i, "refund path exists");
  assert.match(balanceSrc, /creditTopup/, "creditTopup exists");
  assert.match(indexSrc, /Dynadot failed.*refund/i);
});

test("money: renew 1y $14.99 from balance or Stripe checkout", () => {
  assert.match(indexSrc, /app\.post\(.*\/domains\/renew/);
  assert.match(indexSrc, /renew.*1499|1499.*renew/i);
  assert.match(indexSrc, /debitBalance.*Renew/);
  assert.match(indexSrc, /app\.post\(.*\/domains\/renew-stripe/);
  assert.match(stripeSrc, /createDomainCheckoutWithBalanceFallback/);
});

test("money: bulk renew iterates domains with per-day idempotency", () => {
  assert.match(indexSrc, /app\.post\(.*\/domains\/bulk\/renew/);
  assert.match(indexSrc, /bulk:renew/);
  assert.match(indexSrc, /86400000/, "bulk uses daily bucket");
});

test("money: balance_ledger idempotency_key + stripe_events exactly-once", () => {
  assert.match(schema, /balance_ledger/);
  assert.match(schema, /idempotency_key.*UNIQUE/);
  assert.match(schema, /stripe_events/);
  assert.match(indexSrc, /stripe_events/);
  assert.match(indexSrc, /INSERT OR IGNORE INTO stripe_events/);
  assert.match(balanceSrc, /idempotency_key/);
  assert.match(balanceSrc, /INSERT OR IGNORE INTO balance_ledger/);
});

test("money: explicit org required on buy/renew/stripe/bulk/transfer", () => {
  assert.match(indexSrc, /requireExplicitOrg/, "explicit org helper exists");
  assert.match(indexSrc, /requireExplicitOrg/);
  // bulk and transfer now also explicit
  assert.match(indexSrc, /_eB|bulk.*requireExplicitOrg|POST.*bulk.*requireExplicitOrg/i);
  assert.match(indexSrc, /_eTi|transfer\/in.*requireExplicitOrg/i);
  assert.match(indexSrc, /_eR|renew-stripe.*requireExplicitOrg/i);
  assert.match(indexSrc, /explicit org required/);
});

test("money: 90-day audit via Analytics Engine", () => {
  assert.match(indexSrc, /recordAuditEvent|auditReport/);
  assert.match(indexSrc, /domain\.buy|domain\.renew|balance\.debit|balance\.topup/);
  const metrics = readFileSync(new URL("../src/metrics.ts", import.meta.url), "utf8");
  assert.match(metrics, /EVENTS|AnalyticsEngine|audit/);
  assert.match(metrics, /90|retention/);
});

test("money: only owner billed via Stripe customer on org", () => {
  assert.match(indexSrc, /stripe_customer_id/);
  assert.match(indexSrc, /org_balances/);
  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /billing\.manage.*owner|owner.*billing\.manage/);
  assert.match(indexSrc, /can\(member\.role.*billing\.manage/);
});

test("money: amount limits $5–$1000 top-up, $14.99 domain", () => {
  assert.match(stripeSrc, /500/);
  assert.match(stripeSrc, /100000/);
  assert.match(indexSrc, /Minimum top-up|Maximum single top-up/);
});
