import { recordAuditEvent, type MetricsEnv } from "./metrics.ts";

export type BalanceEnv = MetricsEnv & { DB: D1Database; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string };

export async function getOrgBalance(env: BalanceEnv, orgId: number): Promise<number> {
  const row = await env.DB.prepare("SELECT balance_cents FROM org_balances WHERE org_id=?").bind(orgId).first<{balance_cents:number}>();
  return row?.balance_cents ?? 0;
}

export async function debitBalance(env: BalanceEnv, orgId: number, accountId: number, amountCents: number, opts: { idempotencyKey: string; description: string; domain?: string }): Promise<{ ok:boolean; balanceAfter?: number; error?: string }> {
  if (amountCents <= 0) return { ok:false, error:"Invalid amount" };
  const now = Math.floor(Date.now()/1000);
  // Atomic debit: update only if sufficient funds + insert ledger in same batch with idempotency guard
  const existing = await env.DB.prepare("SELECT id FROM balance_ledger WHERE idempotency_key=?").bind(opts.idempotencyKey).first();
  if (existing) return { ok:true, balanceAfter: await getOrgBalance(env, orgId) }; // idempotent replay
  const bal = await getOrgBalance(env, orgId);
  if (bal < amountCents) return { ok:false, error:`Insufficient balance. Need $${(amountCents/100).toFixed(2)}, have $${(bal/100).toFixed(2)}.` };
  const batch = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO org_balances (org_id, balance_cents, updated_at) VALUES (?,0,?)").bind(orgId, now),
    env.DB.prepare("UPDATE org_balances SET balance_cents = balance_cents - ?, updated_at=? WHERE org_id=? AND balance_cents >= ?").bind(amountCents, now, orgId, amountCents),
    env.DB.prepare("INSERT OR IGNORE INTO balance_ledger (org_id, account_id, type, amount_cents, balance_after, description, domain, idempotency_key, created_at) VALUES (?, ?, 'debit', ?, (SELECT balance_cents FROM org_balances WHERE org_id=?), ?, ?, ?, ?)").bind(orgId, accountId, -amountCents, orgId, opts.description, opts.domain||null, opts.idempotencyKey, now),
  ]);
  if (batch[1].meta.changes !== 1) return { ok:false, error:"Balance changed — please retry." };
  const after = await getOrgBalance(env, orgId);
  try { recordAuditEvent(env as any, orgId, { action:"balance.debit", target:`${opts.domain||opts.description} $${(amountCents/100).toFixed(2)}`, actor:String(accountId) }); } catch {}
  return { ok:true, balanceAfter: after };
}

export async function creditTopup(env: BalanceEnv, orgId: number, amountCents: number, stripeSessionId: string, idempotencyKey: string, actor: string): Promise<void> {
  const now = Math.floor(Date.now()/1000);
  const existing = await env.DB.prepare("SELECT id FROM balance_ledger WHERE idempotency_key=?").bind(idempotencyKey).first();
  if (existing) return;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO org_balances (org_id, balance_cents, updated_at) VALUES (?,0,?)").bind(orgId, now),
    env.DB.prepare("UPDATE org_balances SET balance_cents = balance_cents + ?, updated_at=? WHERE org_id=?").bind(amountCents, now, orgId),
    env.DB.prepare("INSERT OR IGNORE INTO balance_ledger (org_id, account_id, type, amount_cents, balance_after, description, stripe_session_id, idempotency_key, created_at) VALUES (?, ?, 'topup', ?, (SELECT balance_cents FROM org_balances WHERE org_id=?), ?, ?, ?, ?)").bind(orgId, Number(actor)||0, amountCents, orgId, `Top-up via Stripe`, stripeSessionId, idempotencyKey, now),
  ]);
  try { recordAuditEvent(env as any, orgId, { action:"balance.topup", target:`+$${(amountCents/100).toFixed(2)}`, actor }); } catch {}
}
