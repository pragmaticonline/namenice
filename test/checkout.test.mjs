import test from "node:test";
import assert from "node:assert/strict";

import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

test("Account can submit a cart Domain as a real Purchase", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/checkout"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /action="\/checkout\?org=/);
  assert.match(html, /name="domains"/);
  assert.match(html, /name="contact_name"/);
  assert.match(html, /name="contact_email"/);
  assert.doesNotMatch(html, /Pay with Stripe \(demo\)/);
  assert.doesNotMatch(html, /addOrder\(/);
  assert.doesNotMatch(html, /one Domain at a time/);
});

test("unverified cart checkout cannot clear purchased Domains", async () => {
  const response = await worker.fetch(new Request("https://namenice.test/checkout/success?org=7"), {});
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.doesNotMatch(html, /clearCart\(\)/);
});
