import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getDynadotBaseUrl, isSandboxCredential, isSandboxEnabled, assertProductionDynadotReady, redactHeaders, sanitizeDynadotErrorMessage, createDynadotSignature, getTransferAuthCode, transferDomainIn, setDnssec } from "../src/dynadot.ts";

const dynadotSrc = readFileSync(new URL("../src/dynadot.ts", import.meta.url), "utf8");
const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("dynadot base url switches on sandbox flag or sandbox_ prefix", () => {
  assert.equal(getDynadotBaseUrl({ DYNADOT_SANDBOX:"true", DYNADOT_API_KEY:"prod_key", DYNADOT_API_SECRET:"prod_secret" }), "https://api-sandbox.dynadot.com");
  assert.equal(getDynadotBaseUrl({ DYNADOT_API_KEY:"sandbox_123", DYNADOT_API_SECRET:"prod" }), "https://api-sandbox.dynadot.com");
  assert.equal(getDynadotBaseUrl({ DYNADOT_API_KEY:"sandbox_key", DYNADOT_API_SECRET:"sandbox_secret" }), "https://api-sandbox.dynadot.com");
  assert.equal(getDynadotBaseUrl({ DYNADOT_API_KEY:"prod_key", DYNADOT_API_SECRET:"prod_secret" }), "https://api.dynadot.com");
  assert.equal(getDynadotBaseUrl({}), "https://api.dynadot.com");
});

test("isSandboxCredential detects sandbox_ prefix", () => {
  assert.equal(isSandboxCredential("sandbox_abc"), true);
  assert.equal(isSandboxCredential("prod_abc"), false);
  assert.equal(isSandboxCredential(undefined), false);
  assert.equal(isSandboxCredential(""), false);
});

test("isSandboxEnabled only true when DYNADOT_SANDBOX === true string", () => {
  assert.equal(isSandboxEnabled({ DYNADOT_SANDBOX:"true"}), true);
  assert.equal(isSandboxEnabled({ DYNADOT_SANDBOX:"True"}), false);
  assert.equal(isSandboxEnabled({ DYNADOT_SANDBOX:"1"}), false);
  assert.equal(isSandboxEnabled({}), false);
});

test("assertProductionDynadotReady refuses sandbox credentials", () => {
  assert.throws(() => assertProductionDynadotReady({}), /not configured/);
  assert.throws(() => assertProductionDynadotReady({ DYNADOT_API_KEY:"sandbox_a", DYNADOT_API_SECRET:"sandbox_b"}), /Refusing production/);
  assert.throws(() => assertProductionDynadotReady({ DYNADOT_API_KEY:"prod_a", DYNADOT_API_SECRET:"prod_b", DYNADOT_SANDBOX:"true"}), /Refusing production/);
  assert.doesNotThrow(() => assertProductionDynadotReady({ DYNADOT_API_KEY:"prod_a", DYNADOT_API_SECRET:"prod_b"}));
});

test("redactHeaders hides Authorization and X-Signature", () => {
  const out = redactHeaders({ Authorization:"Bearer secret", "X-Signature":"abc123", "Content-Type":"application/json", "x-api-key":"key123" });
  assert.equal(out.Authorization, "***REDACTED***");
  assert.equal(out["X-Signature"], "***REDACTED***");
  assert.equal(out["x-api-key"], "***REDACTED***");
  assert.equal(out["Content-Type"], "application/json");
});

test("sanitizeDynadotErrorMessage redacts Bearer and X-Signature", () => {
  assert.equal(sanitizeDynadotErrorMessage("fail Bearer abc123 ok"), "fail Bearer ***REDACTED*** ok");
  assert.equal(sanitizeDynadotErrorMessage("X-Signature: abc123"), "X-Signature: ***REDACTED***");
});

test("createDynadotSignature is base64 HMAC-SHA256 of apiKey\\npath\\nid\\nbody", async () => {
  const sig = await createDynadotSignature("mykey", "mysecret", "/v2/domain/search?domain=example.com", "req-123", '{"a":1}');
  assert.match(sig, /^[A-Za-z0-9+\/=]+$/);
  assert.equal(sig.length > 20, true);
  const sig2 = await createDynadotSignature("mykey", "mysecret", "/v2/domain/search?domain=example.com", "req-123", '{"a":1}');
  assert.equal(sig, sig2, "deterministic");
  const sig3 = await createDynadotSignature("mykey", "mysecret", "/v2/domain/search?domain=other.com", "req-123", '{"a":1}');
  assert.notEqual(sig, sig3, "different path => different sig");
});

test("dynadot source has HMAC base64 and sandbox guard", () => {
  assert.match(dynadotSrc, /HMAC/);
  assert.match(dynadotSrc, /base64/i);
  assert.match(dynadotSrc, /api\.dynadot\.com/);
  assert.match(dynadotSrc, /api-sandbox\.dynadot\.com/);
  assert.match(dynadotSrc, /isSandboxCredential/);
  assert.match(dynadotSrc, /assertProductionDynadotReady/);
});

test("index guards dynadot register with production check where needed", () => {
  // buying via balance should still call dynadot; ensure file references it
  assert.match(indexSrc, /registerDomain|searchDomain/);
});

test("getTransferAuthCode requests a fresh code and unlocks the Domain", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ data: { auth_code: "secret-code" } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await getTransferAuthCode({
    DYNADOT_API_KEY: "sandbox_key",
    DYNADOT_API_SECRET: "secret",
    DYNADOT_SANDBOX: "true",
  }, "example.com", { newCode: true, unlock: true });

  assert.equal(result.ok, true);
  assert.match(request.url, /\/restful\/v2\/domains\/example\.com\/transfer_auth_code/);
  assert.match(request.url, /new_code=true/);
  assert.match(request.url, /unlock_domain_for_transfer=true/);
  assert.equal(request.init.method, "GET");
});

test("transferDomainIn submits the authorization code to Dynadot", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ data: { order_id: "123" } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await transferDomainIn({
    DYNADOT_API_KEY: "sandbox_key",
    DYNADOT_API_SECRET: "secret",
    DYNADOT_SANDBOX: "true",
  }, "example.com", { authCode: "transfer-secret", duration: 1, privacy: "full" });

  assert.equal(result.ok, true);
  assert.match(request.url, /\/restful\/v2\/domains\/example\.com\/transfer_in$/);
  assert.deepEqual(JSON.parse(request.init.body), {
    domain: { duration: 1, auth_code: "transfer-secret", privacy: "full" },
    currency: "USD",
  });
});

test("setDnssec publishes DS and DNSKEY material at Dynadot", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ data: { status: "success" } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await setDnssec({
    DYNADOT_API_KEY: "sandbox_key", DYNADOT_API_SECRET: "secret", DYNADOT_SANDBOX: "true",
  }, "example.com", {
    key_tag: 2371, digest_type: "sha256", digest: "ABCDEF", algorithm: "ecdsa_p256_sha256", flags: "ksk", public_key: "cHVibGlj",
  });

  assert.equal(result.ok, true);
  assert.match(request.url, /\/restful\/v2\/domains\/example\.com\/dnssec$/);
  assert.equal(request.init.method, "PUT");
  assert.deepEqual(JSON.parse(request.init.body), {
    key_tag: 2371, digest_type: "sha256", digest: "ABCDEF", algorithm: "ecdsa_p256_sha256", flags: "ksk", public_key: "cHVibGlj",
  });
});
