import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyStripeSignature, createCartCheckoutSession, createRenewalCheckoutSession } from "../src/stripe.ts";

const stripeSrc = readFileSync(new URL("../src/stripe.ts", import.meta.url), "utf8");
const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

test("stripe module uses HMAC + constantTimeHexEqual + 300s window", () => {
  assert.match(stripeSrc, /HMAC/);
  assert.match(stripeSrc, /constantTimeHexEqual/);
  assert.match(stripeSrc, /300/);
  assert.match(stripeSrc, /parts\.v1/);
  assert.match(stripeSrc, /parts\.t/) // at least checks t
});

test("stripe amount limits enforced for topup", () => {
  assert.match(stripeSrc, /500/);
  assert.match(stripeSrc, /100000/);
  assert.match(stripeSrc, /Minimum top-up/);
  assert.match(stripeSrc, /Maximum single top-up/);
});

test("webhook uses stripe_events idempotency", () => {
  assert.match(indexSrc, /stripe_events/);
  assert.match(indexSrc, /INSERT OR IGNORE INTO stripe_events/);
  assert.match(schema, /stripe_events/);
  assert.match(schema, /id TEXT PRIMARY KEY/);
});

test("verifyStripeSignature valid, multi-v1, and rejects bad/expired/missing", async () => {
  const body = JSON.stringify({ id: "evt_test123", type: "checkout.session.completed" });
  const secret = "whsec_test_secret_123";
  const ts = Math.floor(Date.now()/1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sign = async (t, b) => {
    const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${b}`));
    return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
  };
  const digest = await sign(ts, body);
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=${digest}`, secret), true, "valid sig passes");
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=${"0".repeat(64)},v1=${digest}`, secret), true, "multi-v1 second valid passes");
  const flipped = (digest[0]==="0" ? "1" : "0") + digest.slice(1);
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=${flipped}`, secret), false, "single bit flip fails");
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=${digest}`, "whsec_wrong"), false, "wrong secret fails");
  assert.equal(await verifyStripeSignature(body, undefined, secret), false, "missing sig fails");
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=${digest}`, undefined), false, "missing secret fails");
  assert.equal(await verifyStripeSignature(body, `v1=${digest}`, secret), false, "missing t fails");
  const digest2 = await sign(ts-301, body);
  assert.equal(await verifyStripeSignature(body, `t=${ts-301},v1=${digest2}`, secret), false, "expired >300s fails");
  assert.equal(await verifyStripeSignature(body, `t=${ts},v1=not-hex`, secret), false, "bad hex fails");
  // future timestamp also out of window
  const futureDigest = await sign(ts+900, body);
  assert.equal(await verifyStripeSignature(body, `t=${ts+900},v1=${futureDigest}`, secret), false, "future >300s fails");
});

test("verifyStripeSignature handles extra whitespace and extra params", async () => {
  const body = '{"a":1}';
  const secret = "whsec_extra";
  const ts = Math.floor(Date.now()/1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
  const digest = [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
  assert.equal(await verifyStripeSignature(body, `t=${ts} , v1=${digest} , v0=ignored`, secret), true);
});

test("cart checkout sends every Domain as a Stripe line item", async (t) => {
  const originalFetch = globalThis.fetch;
  let params;
  globalThis.fetch = async (_url, init) => {
    params = new URLSearchParams(init.body);
    return new Response(JSON.stringify({ id: "cs_cart", url: "https://checkout.stripe.test/cart" }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const session = await createCartCheckoutSession({ STRIPE_SECRET_KEY: "sk_test" }, {
    orgId: 42, accountId: 7, email: "account@example.com",
    domains: ["one.example", "two.example"], amountCentsByDomain:{ "one.example":544, "two.example":700 },
    successUrl: "https://namenice.test/domains", cancelUrl: "https://namenice.test/checkout",
  });

  assert.equal(session.url, "https://checkout.stripe.test/cart");
  assert.equal(params.get("line_items[0][price_data][product_data][name]"), "Domain one.example — 1y");
  assert.equal(params.get("line_items[1][price_data][product_data][name]"), "Domain two.example — 1y");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "544");
  assert.equal(params.get("line_items[1][price_data][unit_amount]"), "700");
  assert.equal(params.get("metadata[type]"), "domain_cart_purchase");
  assert.equal(params.get("metadata[domains]"), "one.example,two.example");
});

test("renewal checkout is labeled for registrar renewal fulfillment", async (t) => {
  const originalFetch = globalThis.fetch;
  let params;
  globalThis.fetch = async (_url, init) => {
    params = new URLSearchParams(init.body);
    return new Response(JSON.stringify({id:"cs_renew",url:"https://checkout.stripe.test/renew"}), {status:200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  await createRenewalCheckoutSession({STRIPE_SECRET_KEY:"sk_test"}, {orgId:42,accountId:7,email:"a@example.com",domain:"example.com",amountCents:1499,successUrl:"https://namenice.test/domains",cancelUrl:"https://namenice.test/domains"});
  assert.equal(params.get("metadata[type]"), "domain_renewal");
  assert.equal(params.get("metadata[domain]"), "example.com");
});
