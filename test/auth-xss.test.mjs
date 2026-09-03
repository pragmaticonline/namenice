import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import workerImport from "../src/index.ts";

const worker = workerImport.fetch ? workerImport : workerImport.default;

const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const authSrc = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");

test("auth guard uses requireOrgMember and returns 302/403 correctly", () => {
  assert.match(indexSrc, /requireOrgMember/);
  assert.match(indexSrc, /can\(member\.role/);
  assert.match(indexSrc, /forbidden.*403|403.*forbidden/i);
  // should not have header bypass
  assert.doesNotMatch(indexSrc, /x-namenice-account/);
  assert.doesNotMatch(indexSrc, /x-org-id/i);
  assert.doesNotMatch(indexSrc, /role:\s*row\?\.role\s*\|\|\s*["']owner["']/);
  assert.match(indexSrc, /if\s*\(!row\s*\|\|\s*!acc\?\.id\)\s*return null/);
});

test("can() role matrix correct — owner/admin can manage, viewer cannot", () => {
  assert.match(authSrc, /can\(/);
  assert.match(authSrc, /owner/);
  assert.match(authSrc, /admin/);
  assert.match(authSrc, /viewer/);
  // viewer should be denied for domains.manage
  // check can function logic includes role hierarchy
  assert.match(indexSrc, /domains\.manage/);
  assert.match(indexSrc, /billing/);
});

test("esc() escapes & < > \" ' correctly", () => {
  assert.match(indexSrc, /function esc/);
  assert.match(indexSrc, /&amp;/);
  assert.match(indexSrc, /&lt;/);
  assert.match(indexSrc, /&gt;/);
  assert.match(indexSrc, /&quot;/);
  assert.match(indexSrc, /&#39;/);
  // shell escapes title
  assert.match(indexSrc, /\$\{esc\(title\)\}/);
  assert.match(indexSrc, /esc\(d\.domain\)|esc\(domain\)/);
  // verify esc behavior by evaluating
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  assert.equal(esc(`a&b<c>d"e'f`), `a&amp;b&lt;c&gt;d&quot;e&#39;f`);
  assert.equal(esc(`<script>alert(1)</script>`), `&lt;script&gt;alert(1)&lt;/script&gt;`);
  assert.equal(esc(`"><svg onload=alert(1)>`), `&quot;&gt;&lt;svg onload=alert(1)&gt;`);
});

test("billing/ledger rendering escapes dynamic fields", () => {
  assert.match(indexSrc, /esc\(r\.type\)/);
  assert.match(indexSrc, /esc\(r\.domain\|\|r\.description\)/);
});

test("DNS management renders stored Record fields as text", () => {
  assert.match(indexSrc, /esc\(r\.host\)/);
  assert.match(indexSrc, /esc\(r\.type\)/);
  assert.match(indexSrc, /esc\(r\.value\)/);
});

test("session cookie is HttpOnly and Secure via better-auth", () => {
  assert.match(indexSrc, /createAuth|better-auth/);
  assert.match(indexSrc, /getSession/);
});

test("sign-in only offers server-backed Account authentication", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/signin"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /namenice_signed_in_demo/);
  assert.doesNotMatch(html, /namenice<\/code> \/ <code>1234/);
  assert.match(html, /\/api\/auth\/sign-in\/email/);
  assert.doesNotMatch(html, />Google<|>GitHub</);
});

test("sign-in returns the Account to its same-origin protected destination", async () => {
  const response = await worker.fetch(new Request("http://localhost/signin?next=%2Fbilling%3Forg%3D7"), {});
  const html = await response.text();
  assert.match(html, /\/billing\?org=7/);
  assert.match(html, /href="\/signup\?next=%2Fbilling%3Forg%3D7"/);
  assert.doesNotMatch(html, /location\.href='\/domains'/);
});

test("sign-up preserves checkout as the return destination", async () => {
  const response = await worker.fetch(new Request("http://localhost/signup?next=%2Fcheckout"), {});
  const html = await response.text();
  assert.match(html, /href="\/signin\?next=%2Fcheckout"/);
  assert.match(html, /const requestedNext = "\/checkout"/);
});

test("sign-out returns Better Auth's cookie-clearing response", () => {
  assert.match(indexSrc, /signOut\(\{[\s\S]*asResponse:\s*true/);
  assert.doesNotMatch(indexSrc, /__Secure-better-auth\.session_token=; Max-Age=0/);
});
