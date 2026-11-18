import test from "node:test";
import assert from "node:assert/strict";

import { getDomainQuote } from "../src/availability.ts";

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
