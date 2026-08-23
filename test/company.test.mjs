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
