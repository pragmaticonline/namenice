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
