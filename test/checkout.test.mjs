import test from "node:test";
import assert from "node:assert/strict";

import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

test("signed-out visitor authenticates before seeing registrant details", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/checkout"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/signin?next=%2Fcheckout");
});

test("unverified cart checkout cannot clear purchased Domains", async () => {
  const response = await worker.fetch(new Request("https://namenice.test/checkout/success?org=7"), {});
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.doesNotMatch(html, /clearCart\(\)/);
});
