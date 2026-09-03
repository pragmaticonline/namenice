import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

test("browser-stored values are escaped before HTML rendering", async () => {
  const source = readFileSync(new URL("../public/assets/js/state.js", import.meta.url), "utf8");
  const { escapeHtml } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  assert.equal(escapeHtml(`<img src=x onerror="bad()">'&`), "&lt;img src=x onerror=&quot;bad()&quot;&gt;&#39;&amp;");
});

test("search focus is drawn around the composite control, not inside the input", () => {
  const css = readFileSync(new URL("../public/assets/css/search-results.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /signature-search__input:focus-visible\s*\{[^}]*outline\s*:\s*(?!0|none)/s);
  assert.match(css, /signature-search__frame:focus-within\s*\{[^}]*border-color[^}]*box-shadow/s);
});

test("all pages reserve scrollbar space to prevent navigation jitter", () => {
  const css = readFileSync(new URL("../public/assets/css/base.css", import.meta.url), "utf8");
  assert.match(css, /html\s*\{[^}]*(?:overflow-y\s*:\s*scroll|scrollbar-gutter\s*:\s*stable)/s);
});

test("search page renders a real arrow rather than a Unicode escape", async () => {
  const response = await worker.fetch(new Request("http://localhost/search"), {});
  const html = await response.text();
  assert.match(html, /View all history →/);
  assert.doesNotMatch(html, /View all history \\u2192/);
});

test("rendered page templates contain characters rather than literal Unicode escapes", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\\\\u[0-9a-f]{4}/i);
});

test("malformed domain searches are rejected before registrar lookup", async (t) => {
  const originalFetch = globalThis.fetch;
  let registrarCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.dynadot.com")) registrarCalls++;
    return new Response("unexpected", { status:500 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const query of ["a..com", ".com", "-bad.com", "bad-.com", "foo.invalid", "<script>.com"]) {
    const response = await worker.fetch(new Request(`http://localhost/search?q=${encodeURIComponent(query)}`), {
      DYNADOT_API_KEY:"prod_test_key",
      DYNADOT_API_SECRET:"prod_test_secret",
    });
    const html = await response.text();
    assert.match(html, /Enter a valid domain name/);
    assert.doesNotMatch(html, /already registered/);
    assert.match(html, /const validSearch = false/);
  }
  assert.equal(registrarCalls, 0);
});

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
    if (String(url).includes("rdap.org")) return new Response("blocked", { status:403 });
    if (String(url).includes("rdap.verisign.com")) return new Response("", { status:404 });
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
  assert.match(html, /getCart\(\)\.some/);
  assert.match(html, /btn\.disabled=true/);
});

test("a registered RDAP Domain is never offered even when registrar flags it available", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.dynadot.com")) return new Response(JSON.stringify({ data:{ available:"yes", premium:"no", price:"3.44" } }), { status:200 });
    if (String(url).includes("rdap.verisign.com")) return new Response(JSON.stringify({ objectClassName:"domain", ldhName:"GITHUB.COM" }), { status:200 });
    return originalFetch(url);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await worker.fetch(new Request("http://localhost/search?q=github.com"), { DYNADOT_API_KEY:"prod_test_key", DYNADOT_API_SECRET:"prod_test_secret" });
  const html = await response.text();
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /data-add-domain="github\.com"/);
  assert.doesNotMatch(html, /close options/);
});

test("cart copy does not promise a fixed price before server revalidation", async () => {
  const response = await worker.fetch(new Request("http://localhost/cart"), {});
  const html = await response.text();
  assert.doesNotMatch(html, /registrations are \$14\.99 each/i);
  assert.match(html, /price.*rechecked/i);
});
