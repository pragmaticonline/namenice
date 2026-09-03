import test from "node:test";
import assert from "node:assert/strict";

import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("API Key with domains:read can list its Organization Domains", async () => {
  const rawKey = "nn_0123456789abcdef0123456789abcdef0123456789abcdef";
  const tokenHash = await sha256(rawKey);
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                if (sql.includes("FROM api_keys")) {
                  return { id: 9, org_id: 42, scopes: "domains:read,dns:read", expires_at: null, token_hash: tokenHash };
                }
                return null;
              },
              async all() {
                if (sql.includes("FROM domains")) {
                  return { results: [{ domain: "example.com", status: "active", expires_at: 2_000_000_000 }] };
                }
                return { results: [] };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
    },
  };

  const response = await worker.fetch(
    new Request("http://localhost/api/v1/domains", {
      headers: { authorization: `Bearer ${rawKey}`, "x-org": "42" },
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    domains: [{ domain: "example.com", status: "active", expires_at: 2_000_000_000 }],
  });
});

test("API Key with dns:read can list DNS Records for an Organization Domain", async () => {
  const rawKey = "nn_abcdef0123456789abcdef0123456789abcdef0123456789";
  const tokenHash = await sha256(rawKey);
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM api_keys")) return { id: 10, org_id: 42, scopes: "dns:read", expires_at: null, token_hash: tokenHash };
                return null;
              },
              async all() {
                if (sql.includes("FROM dns_records")) return { results: [{ id: 3, host: "@", type: "A", value: "192.0.2.1", ttl: 3600, priority: null }] };
                return { results: [] };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
    },
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/v1/domains/example.com/dns", {
      headers: { authorization: `Bearer ${rawKey}`, "x-org": "42" },
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    records: [{ id: 3, host: "@", type: "A", value: "192.0.2.1", ttl: 3600, priority: null }],
  });
});

test("API Key with dns:write can create a validated DNS Record", async () => {
  const rawKey = "nn_feedface01234567feedface01234567feedface01234567";
  const tokenHash = await sha256(rawKey);
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM api_keys")) return { id: 11, org_id: 42, scopes: "dns:write", expires_at: null, token_hash: tokenHash };
                return null;
              },
              async all() { return { results: [] }; },
              async run() {
                return { meta: { changes: 1, last_row_id: sql.includes("INSERT INTO dns_records") ? 17 : undefined } };
              },
            };
          },
        };
      },
    },
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/v1/domains/example.com/dns", {
      method: "POST",
      headers: {
        authorization: `Bearer ${rawKey}`,
        "x-org": "42",
        "content-type": "application/json",
      },
      body: JSON.stringify({ host: "www", type: "A", value: "192.0.2.2", ttl: 300 }),
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 17 });
});

test("API Key with dns:write can update a DNS Record", async () => {
  const rawKey = "nn_deadbeef01234567deadbeef01234567deadbeef01234567";
  const tokenHash = await sha256(rawKey);
  let updated = false;
  const env = { DB: { prepare(sql) { return { bind() { return {
    async first() {
      if (sql.includes("FROM api_keys")) return { id: 12, org_id: 42, scopes: "dns:write", expires_at: null, token_hash: tokenHash };
      if (sql.includes("FROM dns_records")) return { id: 17, org_id: 42, domain: "example.com", host: "www", type: "A", value: "192.0.2.2", ttl: 300, priority: null };
      return null;
    },
    async all() { return { results: [] }; },
    async run() { if (sql.includes("UPDATE dns_records")) updated = true; return { meta: { changes: 1 } }; },
  }; } }; } } };
  const response = await worker.fetch(
    new Request("http://localhost/api/v1/domains/example.com/dns/17", {
      method: "PATCH",
      headers: { authorization: `Bearer ${rawKey}`, "x-org": "42", "content-type": "application/json" },
      body: JSON.stringify({ value: "192.0.2.3", ttl: 600 }),
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 204);
  assert.equal(updated, true);
});

test("API Key with dns:write can delete a DNS Record", async () => {
  const rawKey = "nn_cafebabe01234567cafebabe01234567cafebabe01234567";
  const tokenHash = await sha256(rawKey);
  let removed = false;
  const env = { DB: { prepare(sql) { return { bind() { return {
    async first() {
      if (sql.includes("FROM api_keys")) return { id: 13, org_id: 42, scopes: "dns:write", expires_at: null, token_hash: tokenHash };
      return null;
    },
    async all() { return { results: [] }; },
    async run() { if (sql.includes("DELETE FROM dns_records")) removed = true; return { meta: { changes: 1 } }; },
  }; } }; } } };
  const response = await worker.fetch(
    new Request("http://localhost/api/v1/domains/example.com/dns/17", {
      method: "DELETE",
      headers: { authorization: `Bearer ${rawKey}`, "x-org": "42" },
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 204);
  assert.equal(removed, true);
});
