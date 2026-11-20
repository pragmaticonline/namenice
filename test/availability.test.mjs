import test from "node:test";
import assert from "node:assert/strict";

import { getDomainQuote, getTransferPrice } from "../src/availability.ts";

// Shapes mirror the real Dynadot production search response (see /tmp probe
// 2026-11-17): prices come back in the account's currency with a currency tag.
const DYNADOT_USD = { code:200, message:"Success", data:{ domain_name:"foobar2234.com", available:"Yes", premium:"no", price_list:[{ currency:"USD", unit:"(price/1 year)", registration_price:"11.62", renewal_price:"11.62" }] } };
const DYNADOT_THB = { code:200, message:"Success", data:{ domain_name:"foobar2234.com", available:"Yes", premium:"no", price_list:[{ currency:"THB", unit:"(price/1 year)", registration_price:"413.26", renewal_price:"413.26" }] } };

test("domain quotes request USD so Thai-account prices are not shown as dollars", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes("api.dynadot.com")) {
      const inUsd = String(url).includes("currency=USD");
      return new Response(JSON.stringify(inUsd ? DYNADOT_USD : DYNADOT_THB), { status: 200 });
    }
    return new Response("not found", { status: 404 }); // RDAP: not registered
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await getDomainQuote({ DYNADOT_API_KEY:"prod_key", DYNADOT_API_SECRET:"prod_secret" }, "foobar2234.com");

  assert.equal(result.ok, true);
  assert.match(requests.find((u) => u.includes("api.dynadot.com")), /currency=USD/);
  assert.deepEqual(result.quote, { domain:"foobar2234.com", available:true, premium:false, amountCents:1262 });
});

test("transfer price uses the live per-extension Dynadot rate in USD", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const TLD_PRICES = { code:200, message:"Success", data:{ currency:"USD", tld_price_list:[
    { tld:".com", transfer_price:"11.62" },
    { tld:".io", transfer_price:"53.50" },
    { tld:".co.uk", transfer_price:"9.99" },
    { tld:".uk", transfer_price:"8.99" },
  ] } };
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify(TLD_PRICES), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = { DYNADOT_API_KEY:"prod_key", DYNADOT_API_SECRET:"prod_secret" };

  assert.deepEqual(await getTransferPrice(env, "example.io"), { ok:true, price:{ tld:".io", amountCents:5450 } });
  assert.deepEqual(await getTransferPrice(env, "example.COM"), { ok:true, price:{ tld:".com", amountCents:1262 } });
  // longest TLD match wins for multi-level extensions
  assert.deepEqual(await getTransferPrice(env, "example.co.uk"), { ok:true, price:{ tld:".co.uk", amountCents:1099 } });

  const unknown = await getTransferPrice(env, "example.invalidtld");
  assert.equal(unknown.ok, false);

  assert.match(requests.find((u) => u.includes("get_tld_price")), /currency=USD/);
});

test("renewal price uses the live per-extension Dynadot renewal rate in USD", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const TLD_PRICES = { code:200, message:"Success", data:{ currency:"USD", tld_price_list:[
    { tld:".com", registration_price:"11.62", renewal_price:"11.62" },
    { tld:".io", registration_price:"32.00", renewal_price:"35.00" },
    { tld:".co.uk", registration_price:"9.99", renewal_price:"10.99" },
    { tld:".uk", registration_price:"8.99", renewal_price:"9.49" },
  ] } };
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify(TLD_PRICES), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = { DYNADOT_API_KEY:"prod_key", DYNADOT_API_SECRET:"prod_secret" };

  const { getRenewalPrice } = await import("../src/availability.ts");
  // renewal (not registration) rate plus the $1 handling fee
  assert.deepEqual(await getRenewalPrice(env, "example.io"), { ok:true, price:{ tld:".io", amountCents:3600 } });
  assert.deepEqual(await getRenewalPrice(env, "example.COM"), { ok:true, price:{ tld:".com", amountCents:1262 } });
  // longest TLD match wins for multi-level extensions
  assert.deepEqual(await getRenewalPrice(env, "example.co.uk"), { ok:true, price:{ tld:".co.uk", amountCents:1199 } });

  const unknown = await getRenewalPrice(env, "example.invalidtld");
  assert.equal(unknown.ok, false);

  assert.match(requests.find((u) => u.includes("get_tld_price")), /currency=USD/);
});
