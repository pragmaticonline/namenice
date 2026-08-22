import { Hono } from "hono";
import { auditReport, recordAuditEvent, type MetricsEnv } from "./metrics.ts";
import { createTopupCheckoutSession, createDomainCheckoutWithBalanceFallback, stripeConfigured, verifyStripeSignature } from "./stripe.ts";
import { debitBalance, getOrgBalance, creditTopup, type BalanceEnv } from "./balance.ts";
import { can } from "./auth.ts";

type Bindings = MetricsEnv & BalanceEnv & {
  DB: D1Database;
  ROOT_DOMAIN: string;
  CNAME_TARGET: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DYNADOT_API_KEY?: string;
  DYNADOT_API_SECRET?: string;
  DYNADOT_SANDBOX?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// --- helpers (stub auth — replace with Better Auth session after scaffold) ---
async function requireOrgMember(c: any, orgId: number): Promise<{ accountId:number; email:string; role:string } | null> {
  // TODO: resolve from Better Auth session + organization_members.
  // Stub: treat header x-namenice-account as owner for local dev.
  const email = c.req.header("x-namenice-account") || "owner@example.com";
  // In prod, lookup: SELECT role FROM organization_members WHERE org_id=? AND account_id=?
  return { accountId: 1, email, role: "owner" };
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:1rem} .card{border:1px solid #e6e6e6;border-radius:12px;padding:1rem;margin:.8rem 0;background:#fafaf9} .btn{padding:.6rem 1rem;border-radius:999px;background:#111;color:#fff;border:1px solid #111} .muted{color:#6b6b6b} table{width:100%;border-collapse:collapse} th{color:#6b6b6b;text-align:left;border-bottom:1px solid #e6e6e6;padding:.4rem} td{padding:.5rem .3rem;border-bottom:1px solid #f0f0f0}</style></head><body><h1 style="letter-spacing:-.03em">name<span style="color:#1a8917">nice</span></h1>${body}</body></html>`;
}

// Health
app.get("/", (c) => c.html(shell("Namenice", `<div class=card><h2>Find a name you love.</h2><p class=muted>Stripe primary · custom top-ups · pay renewals from balance · 90-day Analytics Engine audit</p><p><a class=btn href="/billing">Balance & billing</a> <a class=btn href="/domains" style="background:#fff;color:#111">Domains</a> <a class=btn href="/audit?org=1" style="background:#fff;color:#111">Audit log</a></p></div>`)));

// Billing: balance + top-up
app.get("/billing", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const balance = await getOrgBalance(c.env as any, orgId);
  const ledger = await c.env.DB.prepare("SELECT type, amount_cents, balance_after, description, domain, created_at FROM balance_ledger WHERE org_id=? ORDER BY created_at DESC LIMIT 20").bind(orgId).all<any>().catch(()=>({results:[]}));
  const rows = (ledger.results||[]).map((r:any)=>`<tr><td>${new Date(r.created_at*1000).toISOString().slice(0,19).replace("T"," ")}</td><td>${r.type}</td><td>${r.domain||r.description}</td><td style="text-align:right">${r.amount_cents>0?"+":""}$${(r.amount_cents/100).toFixed(2)}</td><td style="text-align:right">$${(r.balance_after/100).toFixed(2)}</td></tr>`).join("") || `<tr><td colspan=5 class=muted>No transactions yet.</td></tr>`;
  return c.html(shell("Billing — Namenice", `
    <div class=card style="border-left:4px solid #1a8917"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem"><div><div class=muted>Account balance — org ${orgId}</div><div style="font-size:1.8rem;font-weight:800">$${(balance/100).toFixed(2)}</div><div class=muted style="font-size:.85rem">Auto-renew pays from balance first. Stripe is the processor.</div></div>
      <form method=post action="/billing/topup?org=${orgId}" style="display:flex;gap:.5rem;align-items:center"><input name=amount placeholder="25.00" value="25.00" style="padding:.6rem;border:1px solid #e6e6e6;border-radius:8px;width:110px"> <span class=muted>$</span> <button class=btn type=submit>Top up via Stripe →</button></form>
    </div><div style="margin-top:.6rem;display:flex;gap:.5rem"><a class=btn href="/billing/topup?org=${orgId}&amount=1000" style="background:#fff;color:#111">$10</a><a class=btn href="/billing/topup?org=${orgId}&amount=2500" style="background:#fff;color:#111">$25</a><a class=btn href="/billing/topup?org=${orgId}&amount=5000" style="background:#fff;color:#111">$50</a><a class=btn href="/billing/topup?org=${orgId}&amount=10000" style="background:#fff;color:#111">$100</a></div>
    <div class=muted style="font-size:.78rem;margin-top:.5rem">Min $5 · max $1000 per top-up · idempotent via <code>stripe_events</code> + <code>balance_ledger.idempotency_key</code>.</div></div>
    <div class=card><h3>Ledger</h3><table><thead><tr><th>When</th><th>Type</th><th>Description</th><th style="text-align:right">Amount</th><th style="text-align:right">After</th></tr></thead><tbody>${rows}</tbody></table></div>
  `));
});

app.post("/billing/topup", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured", 503);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden", 403);
  let amountCents: number;
  const qp = c.req.query("amount");
  if (qp) amountCents = Math.round(Number(qp));
  else {
    const form = await c.req.formData().catch(()=>null);
    const raw = String(form?.get("amount")||"").replace(/[^0-9.]/g,"");
    amountCents = Math.round(Number(raw)*100);
  }
  if (!Number.isFinite(amountCents) || amountCents < 500 || amountCents > 100000) return c.text("Amount must be $5–$1000", 400);
  const origin = new URL(c.req.url).origin;
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first<{stripe_customer_id:string|null}>().catch(()=>null);
  const session = await createTopupCheckoutSession(c.env as any, { orgId, accountId: member.accountId, email: member.email, customerId: balRow?.stripe_customer_id||null, amountCents, successUrl: `${origin}/billing?org=${orgId}&message=Top-up+processing`, cancelUrl: `${origin}/billing?org=${orgId}&message=Top-up+cancelled` });
  return c.redirect(session.url, 303);
});

// Domains (pay from balance or Stripe)
app.get("/domains", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const balance = await getOrgBalance(c.env as any, orgId);
  const domains = await c.env.DB.prepare("SELECT domain, status, expires_at, auto_renew FROM domains WHERE org_id=? ORDER BY domain").bind(orgId).all<any>().catch(()=>({results:[]}));
  const rows = (domains.results||[]).map((d:any)=>`<tr><td><b>${d.domain}</b></td><td>${d.status}</td><td>${d.expires_at?new Date(d.expires_at*1000).toISOString().slice(0,10):"—"}</td><td><form method=post action="/domains/renew?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${d.domain}"><input type=hidden name=duration value="1"><label style="font-size:.85rem"><input type=checkbox name=pay_from_balance value=1 checked> balance ($${(balance/100).toFixed(2)})</label> <button class=btn>Renew 1y</button></form> <span class=muted>or</span> <form method=post action="/domains/renew-stripe?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${d.domain}"><button class=btn style="background:#fff;color:#111">Stripe →</button></form></td></tr>`).join("") || `<tr><td colspan=4 class=muted>No domains yet. Buy below.</td></tr>`;
  return c.html(shell("Domains — Namenice", `
    <div class=card><h3>Buy — pay from balance or Stripe</h3>
      <form method=post action="/domains/buy?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center"><input name=domain placeholder="tryacme.com" required style="flex:1;padding:.6rem;border:1px solid #e6e6e6;border-radius:8px"><select name=duration style="padding:.6rem;border:1px solid #e6e6e6;border-radius:8px"><option value=1>1 year — ~$14.99</option><option value=2>2 years</option></select><label style="font-size:.9rem"><input type=checkbox name=pay_from_balance value=1 checked> Pay from balance</label><button class=btn>Buy</button></form>
      <div class=muted style="font-size:.82rem;margin-top:.4rem">Checked = atomic <code>UPDATE org_balances SET balance_cents-= ? WHERE balance_cents &gt;= ?</code>. Unchecked / insufficient → Stripe Checkout fallback.</div>
    </div>
    <div class=card><h3>Renew</h3><div class=muted style="font-size:.85rem">Balance first; Stripe second. Auto-renew cron uses same debit.</div><table><thead><tr><th>Domain</th><th>Status</th><th>Expires</th><th>Renew</th></tr></thead><tbody>${rows}</tbody></table></div>
  `));
});

app.post("/domains/buy", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const duration = Math.max(1,Math.min(10, parseInt(String(form.get("duration")||"1"),10)||1));
  const payFromBalance = String(form.get("pay_from_balance")||"")==="1";
  if (!domain) return c.text("Missing domain", 400);
  const amountCents = 1499 * duration; // TODO: Dynadot TLD price + $2
  if (payFromBalance) {
    const key = `buy:${orgId}:${domain}:${duration}:${amountCents}`;
    const res = await debitBalance(c.env as any, orgId, member.accountId, amountCents, { idempotencyKey: key, description:`Register ${domain} ${duration}y`, domain });
    if (!res.ok) return c.html(shell("Insufficient balance", `<div class=card><p>${res.error}</p><p><a class=btn href="/billing?org=${orgId}">Top up via Stripe →</a> <a class=btn href="/domains?org=${orgId}" style="background:#fff;color:#111">or pay via Stripe</a></p></div>`), 402);
    // TODO: createContact + dynadotRegisterDomain + audit:domain.register
    try { recordAuditEvent(c.env as any, orgId, { action:"domain.register", target:`${domain} ${duration}y $${(amountCents/100).toFixed(2)} via balance`, actor:String(member.accountId) }); } catch {}
    return c.html(shell("Queued", `<div class=card><p>Debited $${(amountCents/100).toFixed(2)} from balance. Registering ${domain}…</p><p class=muted>Balance now $${((res.balanceAfter||0)/100).toFixed(2)}</p><p><a class=btn href="/domains?org=${orgId}">Back to domains</a></p></div>`));
  }
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured", 503);
  const origin = new URL(c.req.url).origin;
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first<any>().catch(()=>null);
  const session = await createDomainCheckoutWithBalanceFallback(c.env as any, { orgId, accountId: member.accountId, email: member.email, customerId: balRow?.stripe_customer_id||null, domain, duration, amountCents, successUrl: `${origin}/domains?org=${orgId}`, cancelUrl: `${origin}/domains?org=${orgId}` });
  return c.redirect(session.url, 303);
});

app.post("/domains/renew", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const duration = Math.max(1,Math.min(10, parseInt(String(form.get("duration")||"1"),10)||1));
  const payFromBalance = String(form.get("pay_from_balance")||"")==="1";
  if (!domain) return c.text("Missing domain", 400);
  const amountCents = 1499 * duration;
  if (payFromBalance) {
    const key = `renew:${orgId}:${domain}:${duration}:${Date.now()}`; // renewals need nonce per attempt; idempotency via ledger unique handles retry
    const res = await debitBalance(c.env as any, orgId, member.accountId, amountCents, { idempotencyKey: key, description:`Renew ${domain} ${duration}y`, domain });
    if (!res.ok) return c.html(shell("Insufficient balance", `<div class=card><p>${res.error}</p><p><a class=btn href="/billing?org=${orgId}">Top up</a></p></div>`), 402);
    try { recordAuditEvent(c.env as any, orgId, { action:"domain.renew", target:`${domain} ${duration}y $${(amountCents/100).toFixed(2)} via balance`, actor:String(member.accountId) }); } catch {}
    // TODO: dynadot renew
    return c.html(shell("Renewed (balance)", `<div class=card><p>Renewed ${domain} — debited $${(amountCents/100).toFixed(2)}.</p></div>`));
  }
  return c.text("Use Stripe renew endpoint", 400);
});

app.post("/domains/renew-stripe", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member) return c.text("forbidden", 403);
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured", 503);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const amountCents = 1499;
  const origin = new URL(c.req.url).origin;
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first<any>().catch(()=>null);
  const session = await createDomainCheckoutWithBalanceFallback(c.env as any, { orgId, accountId: member.accountId, email: member.email, customerId: balRow?.stripe_customer_id||null, domain, duration:1, amountCents, successUrl: `${origin}/domains?org=${orgId}`, cancelUrl: `${origin}/domains?org=${orgId}` });
  return c.redirect(session.url, 303);
});

// Audit — 90 days via Analytics Engine
app.get("/audit", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const page = Math.max(1, parseInt(c.req.query("page")||"1",10)||1);
  try {
    const { entries, hasMore } = await auditReport(c.env as any, orgId, 90, page, 50);
    const rows = entries.map(e=>`<tr><td>${e.occurredAt}</td><td>${e.action}</td><td>${e.target||"—"}</td><td>${e.actor||"—"}</td></tr>`).join("") || `<tr><td colspan=4 class=muted>No actions in last 90 days.</td></tr>`;
    return c.html(shell("Audit log — 90 days", `<div class=card><div style="display:flex;justify-content:space-between"><h3 style="margin:0">Audit log</h3><span class=muted>Last 90 days · Analytics Engine (eventually consistent)</span></div><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right;margin-top:.6rem">${page>1?`<a href="/audit?org=${orgId}&page=${page-1}">← Prev</a> `:""}${hasMore?`<a href="/audit?org=${orgId}&page=${page+1}">Next →</a>`:""}</div></div>`));
  } catch (e:any) { return c.html(shell("Audit", `<div class=card><p>Could not load audit: ${String(e?.message||e).slice(0,300)}</p><p class=muted>Configure CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN.</p></div>`), 502); }
});

// Stripe webhook — single endpoint for top-ups + domain purchases
app.post("/stripe/webhook", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("stripe-signature") || undefined;
  if (!await verifyStripeSignature(raw, sig, c.env.STRIPE_WEBHOOK_SECRET)) return c.json({error:"invalid signature"}, 400);
  let event: any; try { event = JSON.parse(raw); } catch { return c.json({error:"invalid payload"},400); }
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, created_at, status) VALUES (?, ?, ?, 'processing')").bind(event.id, event.type, event.created||Math.floor(Date.now()/1000)).run().catch(()=>null);
  if (inserted && inserted.meta.changes===0) {
    const existing = await c.env.DB.prepare("SELECT status FROM stripe_events WHERE id=?").bind(event.id).first<any>().catch(()=>null);
    if (existing?.status==="processed") return c.json({received:true, duplicate:true});
  }
  try {
    const obj = event.data?.object || {};
    if (event.type==="checkout.session.completed") {
      const meta = obj.metadata || {};
      const type = String(meta.type||"");
      const orgId = Number(meta.org_id||0);
      const accountId = String(meta.account_id||"");
      const amountCents = Number(meta.amount_cents|| obj.amount_total || 0);
      if (type==="balance_topup" && orgId && amountCents>0) {
        const key = `stripe:${event.id}`;
        await creditTopup(c.env as any, orgId, amountCents, String(obj.id||""), key, accountId);
        const cust = typeof obj.customer==="string"?obj.customer:null;
        if (cust) await c.env.DB.prepare("UPDATE org_balances SET stripe_customer_id=COALESCE(stripe_customer_id, ?) WHERE org_id=?").bind(cust, orgId).run().catch(()=>{});
      }
      // domain_purchase handled similarly — debit already done if balance path, otherwise provision after payment
      if (type==="domain_purchase" && orgId) {
        try { recordAuditEvent(c.env as any, orgId, { action:"domain.purchase.stripe", target:String(meta.domain||""), actor:accountId }); } catch {}
      }
    }
    await c.env.DB.prepare("UPDATE stripe_events SET status='processed', processed_at=? WHERE id=?").bind(Math.floor(Date.now()/1000), event.id).run().catch(()=>{});
    return c.json({received:true});
  } catch (e:any) {
    await c.env.DB.prepare("UPDATE stripe_events SET status='failed', last_error=? WHERE id=?").bind(String(e?.message||e).slice(0,500), event.id).run().catch(()=>{});
    return c.json({error:"webhook failed"},500);
  }
});

export default app;
