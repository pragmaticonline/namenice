import test from "node:test";
import assert from "node:assert/strict";

import { fulfillPaidDomain } from "../src/fulfillment.ts";

test("paid Purchase registers the Domain before marking it active", async (t) => {
  const originalFetch = globalThis.fetch;
  const registrarCalls = [];
  let active = false;
  globalThis.fetch = async (url, init) => {
    registrarCalls.push({ url, init });
    if (url.endsWith("/contacts")) return new Response(JSON.stringify({ data: { contact_id: 81 } }), { status: 200 });
    return new Response(JSON.stringify({ data: { order_id: "order-1" } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const contact = { name:"A Person", email:"a@example.com", phone_cc:"1", phone_number:"5551234", address1:"1 Main", city:"Town", state:"CA", zip:"90000", country:"US", privacy:"full", duration:1 };
  const env = {
    DYNADOT_API_KEY:"sandbox_key", DYNADOT_API_SECRET:"secret", DYNADOT_SANDBOX:"true",
    DB: { prepare(sql) { return { bind() { return {
      async first() { return sql.includes("FROM domain_contacts") ? { payload: JSON.stringify(contact) } : null; },
      async run() { if (sql.includes("UPDATE domains SET status='active'")) active = true; return { meta:{ changes:1 } }; },
    }; } }; } },
  };

  const result = await fulfillPaidDomain(env, 42, "example.com");

  assert.deepEqual(result, { ok:true });
  assert.equal(registrarCalls.length, 2);
  assert.match(registrarCalls[1].url, /\/domains\/example\.com\/register$/);
  assert.equal(active, true);
});
