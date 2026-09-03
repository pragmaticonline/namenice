import test from "node:test";
import assert from "node:assert/strict";

import { renewRegisteredDomain } from "../src/renewal.ts";

test("renewal advances local expiry only after Dynadot succeeds", async (t) => {
  const originalFetch = globalThis.fetch;
  let registrarRequest;
  let advanced = false;
  globalThis.fetch = async (url, init) => {
    registrarRequest = { url, init };
    return new Response(JSON.stringify({ data:{ order_id:"renew-1" } }), { status:200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = {
    DYNADOT_API_KEY:"sandbox_key", DYNADOT_API_SECRET:"secret", DYNADOT_SANDBOX:"true",
    DB:{ prepare(sql){ return { bind(){ return {
      async first(){ return { expires_at:Date.UTC(2030, 5, 1)/1000 }; },
      async run(){ if(sql.includes("UPDATE domains SET expires_at")) advanced=true; return {meta:{changes:1}}; },
    }; } }; } },
  };

  const result = await renewRegisteredDomain(env, 42, "example.com");

  assert.deepEqual(result, {ok:true, expirationYear:2030});
  assert.match(registrarRequest.url, /\/domains\/example\.com\/renew$/);
  assert.equal(advanced, true);
});
