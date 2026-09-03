import assert from "node:assert/strict";
import test from "node:test";
import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

test("public HTML identifies its own canonical and Open Graph URL", async () => {
  const response = await worker.fetch(new Request("http://localhost/search?q=example"), {});
  const html = await response.text();
  assert.match(html, /rel="canonical" href="https:\/\/www\.namenice\.net\/search"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.namenice\.net\/search"/);
});

test("unconfigured registrar never offers a fabricated Domain purchase", async () => {
  const response = await worker.fetch(new Request("http://localhost/search?q=namenice"), {});
  const html = await response.text();
  assert.match(html, /Domain search is temporarily unavailable/);
  assert.doesNotMatch(html, /data-add-domain=/);
});

test("favicon is an image rather than a homepage redirect", async () => {
  const response = await worker.fetch(new Request("http://localhost/favicon.ico"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /image\/svg\+xml/);
  assert.match(await response.text(), /<svg/);
});

test("sitemap lists every public acquisition route", async () => {
  const response = await worker.fetch(new Request("http://localhost/sitemap.xml"), {});
  const xml = await response.text();
  for (const path of ["/search", "/signin", "/signup"]) assert.match(xml, new RegExp(`namenice\\.net${path}`));
  assert.doesNotMatch(xml, /namenice\.net\/transfer/);
});

test("unknown routes render a useful noindex page", async () => {
  const response = await worker.fetch(new Request("http://localhost/no-such-page"), {});
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.match(html, /Page not found/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /Return home/);
});

test("private HTML is marked noindex", async () => {
  const response = await worker.fetch(new Request("http://localhost/checkout"), {});
  assert.match(await response.text(), /noindex,nofollow/);
});

test("signed-out visitors cannot see or open Domain transfer controls", async () => {
  const homepage = await worker.fetch(new Request("http://localhost/"), {});
  assert.doesNotMatch(await homepage.text(), /href="\/transfer"/);

  const transfer = await worker.fetch(new Request("http://localhost/transfer"), {});
  assert.equal(transfer.status, 302);
  assert.equal(transfer.headers.get("location"), "/signin?next=%2Ftransfer");
});

test("Dynadot textual no premium flag renders an available standard Domain", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.dynadot.com")) {
      return new Response(JSON.stringify({ data:{ available:"yes", premium:"no", price:"3.44" } }), { status:200, headers:{ "content-type":"application/json" } });
    }
    return originalFetch(url);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request("http://localhost/search?q=boooffffffewfeffewfpop.com"), {
    DYNADOT_API_KEY:"prod_test_key",
    DYNADOT_API_SECRET:"prod_test_secret",
  });
  const html = await response.text();
  assert.match(html, /status-badge--available/);
  assert.doesNotMatch(html, /Premium domain/);
});
