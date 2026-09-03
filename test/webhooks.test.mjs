import test from "node:test";
import assert from "node:assert/strict";

import { dispatchWebhooks } from "../src/webhooks.ts";

test("Organization receives a signed webhook for a subscribed event", async () => {
  const deliveries = [];
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    id: 7,
                    url: "https://hooks.example.test/namenice",
                    events: "domain.registered,dns.updated",
                    secret: "whsec_test",
                  }],
                };
              },
            };
          },
        };
      },
    },
  };

  const result = await dispatchWebhooks(
    env,
    42,
    "domain.registered",
    { domain: "example.com" },
    async (request) => {
      deliveries.push(request);
      return new Response(null, { status: 204 });
    },
  );

  assert.deepEqual(result, { delivered: 1, failed: 0 });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].url, "https://hooks.example.test/namenice");
  assert.equal(deliveries[0].headers.get("x-namenice-event"), "domain.registered");
  assert.match(deliveries[0].headers.get("x-namenice-signature"), /^sha256=[0-9a-f]{64}$/);
  assert.deepEqual(await deliveries[0].json(), {
    event: "domain.registered",
    organization_id: 42,
    data: { domain: "example.com" },
  });
});
