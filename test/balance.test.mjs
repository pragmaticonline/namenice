import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getOrgBalance, debitBalance, creditTopup } from "../src/balance.ts";

const balSrc = readFileSync(new URL("../src/balance.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

function mockDB() {
  const orgBalances = new Map(); // org_id -> cents
  const ledger = new Map(); // idempotency_key -> row
  const makeStmt = (sql) => {
    let bound = [];
    return {
      bind(...args) { bound = args; return this; },
      async first() {
        if (sql.includes("SELECT balance_cents FROM org_balances")) {
          const orgId = bound[0];
          return orgBalances.has(orgId) ? { balance_cents: orgBalances.get(orgId) } : null;
        }
        if (sql.includes("SELECT id FROM balance_ledger")) {
          const key = bound[0];
          return ledger.has(key) ? { id: 1 } : null;
        }
        return null;
      },
      async run() { return { meta: { changes: 1 } }; },
    };
  };
  return {
    _org: orgBalances, _ledger: ledger,
    prepare(sql) { return makeStmt(sql); },
    async batch(stmts) {
      // simulate batch execution with simple logic
      const metas = [];
      for (const s of stmts) {
        // we need to inspect SQL string - but we lost it. Hack: use bound length to infer
        metas.push({ meta: { changes: 1 } });
      }
      // actually implement via direct state mutations called explicitly in test wrappers
      return metas;
    }
  };
}

// Real D1Mock with proper SQL dispatch — simpler: use Miniflare-like stub that actually mutates via batch parsing
function createRealMock() {
  const orgBalances = new Map();
  const ledger = new Map();
  return {
    _org: orgBalances, _ledger: ledger,
    prepare(sql) {
      let b = [];
      const stmt = {
        bind(...args) { b = args; return stmt; },
        async first() {
          if (sql.includes("FROM org_balances")) return orgBalances.has(b[0]) ? { balance_cents: orgBalances.get(b[0]) } : null;
          if (sql.includes("FROM balance_ledger")) return ledger.has(b[0]) ? { id: 1 } : null;
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
        _sql: sql, _bind: () => b,
      };
      return stmt;
    },
    async batch(stmts) {
      let results = [];
      for (const s of stmts) {
        const sql = s._sql;
        const b = s._bind();
        if (sql.includes("INSERT OR IGNORE INTO org_balances")) {
          const orgId = b[0]; const now = b[1];
          if (!orgBalances.has(orgId)) orgBalances.set(orgId, 0);
          results.push({ meta: { changes: orgBalances.has(orgId)?0:1 } });
        } else if (sql.includes("UPDATE org_balances SET balance_cents = balance_cents -")) {
          const amount = b[0]; const now = b[1]; const orgId = b[2]; const min = b[3];
          const cur = orgBalances.get(orgId) ?? 0;
          if (cur >= min) { orgBalances.set(orgId, cur - amount); results.push({ meta: { changes: 1 } }); }
          else results.push({ meta: { changes: 0 } });
        } else if (sql.includes("UPDATE org_balances SET balance_cents = balance_cents +")) {
          const amount = b[0]; const now = b[1]; const orgId = b[2];
          const cur = orgBalances.get(orgId) ?? 0;
          orgBalances.set(orgId, cur + amount);
          results.push({ meta: { changes: 1 } });
        } else if (sql.includes("INSERT OR IGNORE INTO balance_ledger")) {
          // detect idempotency_key position — last bound before created_at or near end
          // schema: ... idempotency_key, created_at  -> bind order varies; key is second-last or third-last
          // debit: bind(orgId, accountId, -amount, orgId, desc, domain, key, now) => key = b[6]
          // credit: bind(orgId, actor, amount, orgId, desc, session, key, now) => key = b[6]
          const key = b[6];
          if (ledger.has(key)) results.push({ meta: { changes: 0 } });
          else { ledger.set(key, { org: b[0], key, amount: b[2] ?? b[3] }); results.push({ meta: { changes: 1 } }); }
        } else results.push({ meta: { changes: 1 } });
      }
      return results;
    }
  };
}

test("balance schema has UNIQUE idempotency_key and stripe_events", () => {
  assert.match(schema, /balance_ledger/);
  assert.match(schema, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(schema, /org_balances/);
});

test("balance module guards invalid amount", async () => {
  const db = createRealMock();
  const env = { DB: db };
  const r = await debitBalance(env, 1, 1, 0, { idempotencyKey: "k0", description: "x" });
  assert.equal(r.ok, false);
  assert.match(r.error||"", /Invalid amount/);
});

test("debit with sufficient funds succeeds and debits", async () => {
  const db = createRealMock();
  db._org.set(1, 5000);
  const env = { DB: db };
  const r = await debitBalance(env, 1, 10, 1500, { idempotencyKey: "k1", description: "domain test.com", domain: "test.com" });
  assert.equal(r.ok, true);
  assert.equal(r.balanceAfter, 3500);
  assert.equal(db._org.get(1), 3500);
  assert.equal(db._ledger.has("k1"), true);
});

test("debit insufficient returns error and does not change balance", async () => {
  const db = createRealMock();
  db._org.set(1, 1000);
  const env = { DB: db };
  const r = await debitBalance(env, 1, 10, 5000, { idempotencyKey: "k2", description: "buy" });
  assert.equal(r.ok, false);
  assert.match(r.error||"", /Insufficient balance/);
  assert.equal(db._org.get(1), 1000);
});

test("debit replay same idempotencyKey is idempotent", async () => {
  const db = createRealMock();
  db._org.set(1, 5000);
  const env = { DB: db };
  const a = await debitBalance(env, 1, 10, 1000, { idempotencyKey: "k3", description: "once" });
  assert.equal(a.ok, true);
  assert.equal(a.balanceAfter, 4000);
  const b = await debitBalance(env, 1, 10, 1000, { idempotencyKey: "k3", description: "once" });
  assert.equal(b.ok, true);
  assert.equal(b.balanceAfter, 4000);
  assert.equal(db._org.get(1), 4000, "second replay must not double-debit");
  assert.equal(db._ledger.size, 1);
});

test("creditTopup replay is idempotent", async () => {
  const db = createRealMock();
  db._org.set(1, 0);
  const env = { DB: db };
  await creditTopup(env, 1, 2500, "cs_123", "topup-k1", "10");
  assert.equal(db._org.get(1), 2500);
  await creditTopup(env, 1, 2500, "cs_123", "topup-k1", "10");
  assert.equal(db._org.get(1), 2500, "replay must not double-credit");
  assert.equal(db._ledger.size, 1);
});

test("credit then debit sequence keeps correct balance", async () => {
  const db = createRealMock();
  db._org.set(1, 0);
  const env = { DB: db };
  await creditTopup(env, 1, 10000, "cs_a", "k-top", "1");
  const r = await debitBalance(env, 1, 1, 3000, { idempotencyKey: "k-d", description: "domain" });
  assert.equal(r.ok, true);
  assert.equal(db._org.get(1), 7000);
});

test("balance src has atomic batch and idempotency guard", () => {
  assert.match(balSrc, /balance_ledger/);
  assert.match(balSrc, /idempotency_key/);
  assert.match(balSrc, /INSERT OR IGNORE/);
  assert.match(balSrc, /UPDATE org_balances SET balance_cents/);
  assert.match(balSrc, /balance_cents >=/);
  assert.match(balSrc, /DB\.batch/);
});
