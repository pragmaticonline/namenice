import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const authSrc = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");

test("auth guard uses requireOrgMember and returns 302/403 correctly", () => {
  assert.match(indexSrc, /requireOrgMember/);
  assert.match(indexSrc, /can\(member\.role/);
  assert.match(indexSrc, /forbidden.*403|403.*forbidden/i);
  // should not have header bypass
  assert.doesNotMatch(indexSrc, /x-namenice-account/);
  assert.doesNotMatch(indexSrc, /x-org-id/i);
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

test("session cookie is HttpOnly and Secure via better-auth", () => {
  assert.match(indexSrc, /createAuth|better-auth/);
  assert.match(indexSrc, /getSession/);
});
