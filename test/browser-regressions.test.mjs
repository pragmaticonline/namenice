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

test("signed-out visitors cannot open Domain transfer controls", async () => {
  const homepage = await worker.fetch(new Request("http://localhost/"), {});
  const html = await homepage.text();
  // Redesign marketing nav intentionally links /transfer; the route itself stays auth-gated.
  assert.match(html, /href="\/transfer"/);
  assert.doesNotMatch(html, /action="\/domains\/transfer/);
  assert.doesNotMatch(html, /Authorization code/);

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
  assert.match(html, /Available — exact match/);
  assert.match(html, /pill--success/);
  assert.doesNotMatch(html, /Premium domain/);
  assert.match(html, /data-add-domain="boooffffffewfeffewfpop\.com"/);
  assert.match(html, /Other extensions/);
  assert.match(html, /removeFromCart\(/);
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
  assert.match(html, /Taken/);
  assert.doesNotMatch(html, /data-add-domain="github\.com"/);
  assert.doesNotMatch(html, /close options/);
});

test("cart copy does not promise a fixed price before server revalidation", async () => {
  const response = await worker.fetch(new Request("http://localhost/cart"), {});
  const html = await response.text();
  assert.doesNotMatch(html, /registrations are \$14\.99 each/i);
  assert.match(html, /price.*rechecked/i);
});

test("SPA bundles and SSR HTML never ship demo login copy", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const assets = join(new URL("../public/assets/js", import.meta.url).pathname);
  const files = readdirSync(assets).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const content = readFileSync(join(assets, file), "utf8");
    assert.doesNotMatch(content, /Demo login/i, `${file} must not contain Demo login`);
    assert.doesNotMatch(content, /presentation demo/i, `${file} must not contain presentation demo`);
    // DEMO credentials may remain in state.js as constants but must not be user-visible copy
    if (file !== "state.js") {
      assert.doesNotMatch(content, /username.*namenice.*1234/i, `${file} must not leak demo credentials`);
    }
  }
  // SSR HTML also must not leak demo
  for (const path of ["/signup", "/signin"]) {
    const res = await worker.fetch(new Request(`http://localhost${path}`), {});
    const html = await res.text();
    assert.doesNotMatch(html, /Demo login/i, `${path} HTML must not contain Demo login`);
    assert.doesNotMatch(html, /1234/, `${path} HTML must not contain 1234`);
    assert.match(html, /Secure auth via Better Auth/, `${path} should show real auth copy`);
  }
  // Cart drawer inline auth (the page-by-page miss) — check the JS that renders it
  const cartDrawer = readFileSync(join(assets, "cart-drawer.js"), "utf8");
  assert.doesNotMatch(cartDrawer, /Demo login/, "cart-drawer inline auth must not show Demo login");
  assert.match(cartDrawer, /Secure auth via Better Auth/, "cart drawer should show Secure auth");
  assert.match(cartDrawer, /\/api\/auth\/sign-in\/email/, "cart drawer should call real Better Auth");
  assert.match(cartDrawer, /Email address/, "cart drawer should use Email field");
});

test("cart drawer shows real user when server session present", async () => {
  const res = await worker.fetch(new Request("http://localhost/"), {});
  const html = await res.text();
  assert.match(html, /window\.__NAMENICE_SIGNED_IN__/);
  assert.match(html, /window\.__NAMENICE_USER__/);
  const cartDrawer = readFileSync(new URL("../public/assets/js/cart-drawer.js", import.meta.url), "utf8");
  assert.match(cartDrawer, /__NAMENICE_USER__/);
});

test("shell links badger brand assets and manifest", async () => {
  const res = await worker.fetch(new Request("http://localhost/"), {});
  const html = await res.text();
  assert.match(html, /\/brand\/favicon\.svg/);
  assert.match(html, /\/brand\/apple-touch-icon\.png/);
  assert.match(html, /\/site\.webmanifest/);
  assert.match(html, /\/brand\/badger-mark\.svg/);
  assert.match(html, /og:image/);
});

test("fonts are self-hosted and preloaded, no third-party font requests", async () => {
  const res = await worker.fetch(new Request("http://localhost/"), {});
  const html = await res.text();
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
  assert.match(html, /rel="preload"[^>]*bricolage-grotesque-latin\.woff2/);
  assert.match(html, /rel="preload"[^>]*geist-latin\.woff2/);
  // Static-asset serving is verified against the deployed worker, not the
  // unit-test harness (which has no asset pipeline): see live check notes.
});

test("site manifest names namenice with installable icons", async () => {
  const res = await worker.fetch(new Request("http://localhost/site.webmanifest"), {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/manifest\+json/);
  const manifest = await res.json();
  assert.equal(manifest.short_name, "namenice");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
});

test("exact-match domain name stays compact and wraps gracefully", () => {
  const css = readFileSync(new URL("../public/assets/css/search-results.css", import.meta.url), "utf8");
  assert.match(css, /\.srch-exact__domain\s*\{[^}]*font-size\s*:\s*32px[^}]*overflow-wrap\s*:\s*break-word/s);
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*\{[^}]*\.srch-exact__domain\s*\{[^}]*font-size\s*:\s*26px/s);
});

test("search page inline module ships syntactically valid JavaScript", async (t) => {
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

  const response = await worker.fetch(new Request("http://localhost/search?q=filterheartcheck"), {
    DYNADOT_API_KEY:"prod_test_key",
    DYNADOT_API_SECRET:"prod_test_secret",
  });
  const html = await response.text();
  const modules = [...html.matchAll(/<script type="module">(.*?)<\/script>/gs)].map((m) => m[1]);
  assert.ok(modules.length > 0, "search page has an inline module");
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "namenice-inline-"));
  for (const [i, src] of modules.entries()) {
    const file = join(dir, `search-inline-${i}.mjs`);
    writeFileSync(file, src);
    execFileSync(process.execPath, ["--check", file], { stdio:"pipe" });
  }
});

test("favorited heart renders filled bright red", () => {
  const css = readFileSync(new URL("../public/assets/css/search-results.css", import.meta.url), "utf8");
  assert.match(css, /\.compare-table__favorite\[aria-pressed="true"\]\s*\{[^}]*color\s*:\s*#F5222D/s);
  assert.match(css, /\.compare-table__favorite\[aria-pressed="true"\]\s+svg\s*\{[^}]*fill\s*:\s*currentColor/s);
});

test("buy form offers saved addresses with a country dropdown", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.dynadot.com")) {
      return new Response(JSON.stringify({ data:{ available:"yes", premium:"no", price:"11.62" } }), { status:200, headers:{ "content-type":"application/json" } });
    }
    if (String(url).includes("rdap.org")) return new Response("blocked", { status:403 });
    if (String(url).includes("rdap.verisign.com")) return new Response("", { status:404 });
    return originalFetch(url);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const savedPayload = JSON.stringify({ name:"A Person", email:"a@example.com", phone_cc:"66", phone_number:"81", address1:"9 Soi", city:"BKK", zip:"10100", country:"TH" });
  const db = { prepare(sql) { return { bind() { return {
    async first() { return sql.includes("org_balances") ? { balance_cents: 5000 } : null; },
    async all() { return sql.includes("domain_contacts") ? { results: [{ payload: savedPayload }] } : { results: [] }; },
    async run() { return {}; },
  }; } }; } };
  const env = { DYNADOT_API_KEY:"prod_test_key", DYNADOT_API_SECRET:"prod_test_secret", DB: db };
  const response = await worker.fetch(new Request("http://localhost/domains/search", {
    method:"POST",
    headers:{ "content-type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({ domain:"buyformcheck.com" }).toString(),
  }), env);
  const html = await response.text();
  assert.match(html, /id="buy-saved"/);
  assert.match(html, /<option value="0" selected>/);
  assert.match(html, /value="A Person"/);
  assert.match(html, /<select name=contact_country[^>]*>/);
  assert.match(html, /<option value="TH" selected>Thailand<\/option>/);
  const modules = [...html.matchAll(/<script type="module">(.*?)<\/script>/gs)].map((m) => m[1]);
  assert.ok(modules.length > 0);
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "namenice-buy-"));
  for (const [i, src] of modules.entries()) {
    const file = join(dir, `buy-inline-${i}.mjs`);
    writeFileSync(file, src);
    execFileSync(process.execPath, ["--check", file], { stdio:"pipe" });
  }
});

test("buy form defaults country to the visitor's geo header", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.dynadot.com")) {
      return new Response(JSON.stringify({ data:{ available:"yes", premium:"no", price:"11.62" } }), { status:200, headers:{ "content-type":"application/json" } });
    }
    if (String(url).includes("rdap.org")) return new Response("blocked", { status:403 });
    if (String(url).includes("rdap.verisign.com")) return new Response("", { status:404 });
    return originalFetch(url);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const db = { prepare() { return { bind() { return {
    async first() { return { balance_cents: 5000 }; },
    async all() { return { results: [] }; },
    async run() { return {}; },
  }; } }; } };
  const env = { DYNADOT_API_KEY:"prod_test_key", DYNADOT_API_SECRET:"prod_test_secret", DB: db };
  const response = await worker.fetch(new Request("http://localhost/domains/search", {
    method:"POST",
    headers:{ "content-type":"application/x-www-form-urlencoded", "cf-ipcountry": "TH" },
    body: new URLSearchParams({ domain:"geoformcheck.com" }).toString(),
  }), env);
  const html = await response.text();
  assert.doesNotMatch(html, /id="buy-saved"/);
  assert.match(html, /<option value="TH" selected>Thailand<\/option>/);
});

test("invalid search shows Dig with guidance", async () => {
  for (const query of ["a..com", "foo.invalid", "<script>.com"]) {
    const res = await worker.fetch(new Request(`http://localhost/search?q=${encodeURIComponent(query)}`), {});
    assert.match(await res.text(), /badger-mark\.svg/);
  }
});
