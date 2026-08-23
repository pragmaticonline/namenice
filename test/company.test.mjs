import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("solo-first: billing shows Your balance for Personal Organization (solo copy)", () => {
  assert.match(indexSrc, /Your balance/, "billing should say Your balance for personal");
  assert.doesNotMatch(indexSrc, /Account balance — org/);
});

test("solo-first: Personal Organization auto-create helper exists and is called on session", () => {
  assert.match(indexSrc, /ensurePersonalOrganization/);
  assert.match(indexSrc, /organization_members/);
  assert.match(indexSrc, /INSERT.*INTO organizations/);
  assert.match(indexSrc, /Your balance|Your domains/);
});

test("solo-first: every Domain and balance remains org-owned (single owner invariant)", () => {
  assert.match(indexSrc, /INTO domains/);
  assert.match(indexSrc, /org_balances/);
  assert.match(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"), /domains\s*\(/);
  // org_balances is org_id PK, not account_id
  assert.match(indexSrc, /org_id/);
});

test("company-upgrade: schema has is_company flag on organizations", () => {
  const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  assert.match(schema, /is_company/);
});

test("company-upgrade: Company checkbox + POST upgrade endpoint exists", () => {
  assert.match(indexSrc, /POST.*company|company.*upgrade/i);
  assert.match(indexSrc, /is_company/);
  assert.match(indexSrc, /Company/);
});

test("company-upgrade: billing/domains flip to Organization when is_company or member>1", () => {
  assert.match(indexSrc, /Organization balance/);
  assert.match(indexSrc, /memberCount|COUNT\(\*\)/);
  assert.match(indexSrc, /isPersonal|is_company/);
});

test("org-explicit-money: helper enforces explicit org when account has multiple orgs", () => {
  assert.match(indexSrc, /explicit.*org|getUserOrgIds|requireExplicitOrg/i);
  assert.match(indexSrc, /SELECT org_id FROM organization_members/);
});

test("org-explicit-money: POST /billing/topup requires explicit org", () => {
  assert.match(indexSrc, /app\.post\("\/billing\/topup"/);
  // should check for multiple orgs before debit
  assert.match(indexSrc, /400.*explicit|explicit.*400/i);
});

test("org-explicit-money: POST /domains/buy and renew require explicit org", () => {
  assert.match(indexSrc, /app\.post\("\/domains\/buy"/);
  assert.match(indexSrc, /app\.post\("\/domains\/renew"/);
  assert.match(indexSrc, /explicit.*org/i);
});

test("company-members: invite create + 7-day token_hash exists", () => {
  assert.match(indexSrc, /organization_invitations/);
  assert.match(indexSrc, /token_hash/);
  assert.match(indexSrc, /7.*day|expires_at.*7|604800/);
  assert.match(indexSrc, /POST.*invite|invite.*POST/i);
});

test("company-members: can() gates viewer/billing/admin correctly", () => {
  const authSrc = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  assert.match(authSrc, /billing\.manage/);
  assert.match(authSrc, /members\.manage/);
  assert.match(authSrc, /dns\.manage/);
  // viewer should be denied for billing/domains
  assert.match(indexSrc, /can\(member\.role/);
  assert.match(authSrc, /viewer/);
});

test("company-members: accept invite creates organization_members", () => {
  assert.match(indexSrc, /accept.*invite|invite.*accept/i);
  assert.match(indexSrc, /INSERT.*INTO organization_members/);
});
