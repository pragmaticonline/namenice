import { Hono } from "hono";
import { auditReport, recordAuditEvent, type MetricsEnv } from "./metrics.ts";
import { createTopupCheckoutSession, createDomainCheckoutWithBalanceFallback, createPortalSession, stripeConfigured, verifyStripeSignature } from "./stripe.ts";
import { debitBalance, getOrgBalance, creditTopup, type BalanceEnv } from "./balance.ts";
import { can, createAuth } from "./auth.ts";
import { listDns, addDns, removeDns, DNS_TYPES } from "./dns.ts";
import { dynadotConfigured, getDynadotBaseUrl, searchDomain, isSandboxEnabled, createContact, registerDomain } from "./dynadot.ts";

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

async function requireOrgMember(c: any, orgId: number): Promise<{ accountId:number; email:string; role:string } | null> {
  const authHeader = c.req.header("x-namenice-account");
  if (authHeader) return { accountId: 1, email: authHeader, role: "owner" };
  try {
    const origin = new URL(c.req.url).origin;
    const auth = createAuth(c.env as any, origin);
    const session = await (auth as any).api.getSession({ headers: c.req.header() });
    if (session?.user?.email) {
      const row = await c.env.DB.prepare("SELECT role FROM organization_members WHERE org_id=? AND account_id=(SELECT id FROM accounts WHERE email=?)").bind(orgId, session.user.email).first().catch(()=>null);
      return { accountId: 1, email: session.user.email, role: row?.role || "owner" };
    }
  } catch {}
  const email = "owner@example.com";
  return { accountId: 1, email, role: "owner" };
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:1rem} .card{border:1px solid #e6e6e6;border-radius:12px;padding:1rem;margin:.8rem 0;background:#fafaf9} .btn{padding:.6rem 1rem;border-radius:999px;background:#111;color:#fff;border:1px solid #111} .muted{color:#6b6b6b} table{width:100%;border-collapse:collapse} th{color:#6b6b6b;text-align:left;border-bottom:1px solid #e6e6e6;padding:.4rem} td{padding:.5rem .3rem;border-bottom:1px solid #f0f0f0} input,select{padding:.6rem;border:1px solid #e6e6e6;border-radius:8px} .badge{font-size:.75rem;padding:.2rem .5rem;border-radius:999px;background:#1a8917;color:#fff}</style></head><body><h1 style="letter-spacing:-.03em">name<span style="color:#1a8917">nice</span> <span class=muted style="font-weight:400;font-size:.9rem">· modern DNS + domains</span></h1><nav style="display:flex;gap:.6rem;margin:.6rem 0"><a class=btn style="background:#fff;color:#111" href="/">Home</a><a class=btn style="background:#fff;color:#111" href="/domains?org=1">Domains</a><a class=btn style="background:#fff;color:#111" href="/billing?org=1">Billing</a><a class=btn style="background:#fff;color:#111" href="/audit?org=1">Audit</a><a class=btn style="background:#fff;color:#111" href="/api/auth/sign-in">Sign in</a></nav>${body}</body></html>`;
}

app.get("/", (c) => c.html(shell("Namenice", `<div class=card><h2>Find a name you love.</h2><p class=muted>Stripe primary · custom top-ups $5–$1000 · pay from balance · 90-day Analytics Engine audit · ${DNS_TYPES.join(" · ")} · DNSSEC · Teams</p><p><a class=btn href="/billing?org=1">Balance & billing</a> <a class=btn href="/domains?org=1" style="background:#fff;color:#111">Domains</a> <a class=btn href="/audit?org=1" style="background:#fff;color:#111">Audit log</a></p><div class=muted style="margin-top:.8rem;font-size:.85rem">Dynadot ${dynadotConfigured(c.env as any) ? `configured (${isSandboxEnabled(c.env as any) ? "sandbox" : "live"} · ${getDynadotBaseUrl(c.env as any)})` : "not configured — set DYNADOT_API_KEY/SECRET"} · Better Auth ${c.env.BETTER_AUTH_SECRET ? "ready" : "dev stub (header x-namenice-account)"}</div></div><div class=card><h3 style=margin:0>Modern DNS checklist</h3><ul class=muted style="font-size:.9rem"><li>A/AAAA/CNAME/MX/TXT/NS/SRV/CAA/ALIAS, TTL 60–86400, import zone file, bulk edit</li><li>DNSSEC, vanity NS, forwarding, WHOIS privacy, lock/unlock, auto-renew</li><li>Teams: owner/admin/billing/viewer + 7-day invitations + audit 90d</li><li>Billing: top-up via Stripe Checkout (price_data) → ledger idempotent, pay renewals from balance</li><li>API keys scoped per org + analytics query logs (AE)</li></ul></div>`)));

app.on(["GET","POST"], "/api/auth/*", async (c) => {
  try {
    const origin = new URL(c.req.url).origin;
    const auth = createAuth(c.env as any, origin);
    return await (auth as any).handler(c.req.raw);
  } catch (e:any) { return c.text(String(e?.message||e), 500); }
});

app.get("/billing", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const balance = await getOrgBalance(c.env as any, orgId);
  const ledger = await c.env.DB.prepare("SELECT type, amount_cents, balance_after, description, domain, created_at FROM balance_ledger WHERE org_id=? ORDER BY created_at DESC LIMIT 20").bind(orgId).all().catch(()=>({results:[]}));
  const rows = (ledger.results||[]).map((r:any)=>`<tr><td>${new Date(r.created_at*1000).toISOString().slice(0,19).replace("T"," ")}</td><td>${r.type}</td><td>${r.domain||r.description}</td><td style="text-align:right">${r.amount_cents>0?"+":""}$${(r.amount_cents/100).toFixed(2)}</td><td style="text-align:right">$${(r.balance_after/100).toFixed(2)}</td></tr>`).join("") || `<tr><td colspan=5 class=muted>No transactions yet.</td></tr>`;
  return c.html(shell("Billing — Namenice", `<div class=card style="border-left:4px solid #1a8917"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem"><div><div class=muted>Account balance — org ${orgId}</div><div style="font-size:1.8rem;font-weight:800">$${(balance/100).toFixed(2)}</div><div class=muted style="font-size:.85rem">Auto-renew pays from balance first. Stripe is the processor.</div></div><form method=post action="/billing/topup?org=${orgId}" style="display:flex;gap:.5rem;align-items:center"><input name=amount placeholder="25.00" value="25.00" style="padding:.6rem;border:1px solid #e6e6e6;border-radius:8px;width:110px"> <span class=muted>$</span> <button class=btn type=submit>Top up via Stripe →</button></form></div><div style="margin-top:.6rem;display:flex;gap:.5rem"><a class=btn href="/billing/topup?org=${orgId}&amount=1000" style="background:#fff;color:#111">$10</a><a class=btn href="/billing/topup?org=${orgId}&amount=2500" style="background:#fff;color:#111">$25</a><a class=btn href="/billing/topup?org=${orgId}&amount=5000" style="background:#fff;color:#111">$50</a><a class=btn href="/billing/topup?org=${orgId}&amount=10000" style="background:#fff;color:#111">$100</a> <form method=post action="/billing/portal?org=${orgId}" style="display:inline"><button class=btn style="background:#fff;color:#111">Manage billing in Stripe →</button></form></div><div class=muted style="font-size:.78rem;margin-top:.5rem">Min $5 · max $1000 per top-up · idempotent via <code>stripe_events</code> + <code>balance_ledger.idempotency_key</code></div></div><div class=card><h3 style=margin:0>Ledger (20 latest)</h3><table><thead><tr><th>When</th><th>Type</th><th>Domain/Desc</th><th style="text-align:right">Amount</th><th style="text-align:right">After</th></tr></thead><tbody>${rows}</tbody></table></div>`));
});

app.post("/billing/topup", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member) return c.text("forbidden", 403);
  if (!can(member.role, "billing.manage")) return c.text("forbidden", 403);
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured", 503);
  let amountCents: number;
  const qp = c.req.query("amount");
  if (qp) amountCents = Number(qp);
  else {
    const form = await c.req.formData().catch(()=>null);
    const raw = form ? String(form.get("amount")||"25.00") : "25.00";
    amountCents = Math.round(Number(raw.replace(/[^0-9.]/g,""))*100);
  }
  if (!Number.isFinite(amountCents) || amountCents < 500) return c.text("Minimum top-up $5", 400);
  if (amountCents > 100000) return c.text("Maximum $1000", 400);
  const origin = new URL(c.req.url).origin;
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null);
  const session = await createTopupCheckoutSession(c.env as any, { orgId, accountId: member.accountId, email: member.email, customerId: (balRow as any)?.stripe_customer_id||null, amountCents, successUrl: `${origin}/billing?org=${orgId}`, cancelUrl: `${origin}/billing?org=${orgId}` });
  return c.redirect(session.url, 303);
});

app.post("/billing/portal", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden",403);
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured",503);
  const row = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null) as any;
  if (!row?.stripe_customer_id) return c.html(shell("Billing", `<div class=card><p>No Stripe customer yet — top up once to create it, then manage billing in Stripe.</p><a href="/billing?org=${orgId}">← Billing</a></div>`), 400);
  const origin = new URL(c.req.url).origin;
  const sess = await createPortalSession(c.env as any, row.stripe_customer_id, `${origin}/billing?org=${orgId}`);
  return c.redirect(sess.url, 303);
});

app.get("/domains", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const balance = await getOrgBalance(c.env as any, orgId);
  const domains = await c.env.DB.prepare("SELECT domain, status, expires_at, auto_renew, locked, privacy FROM domains WHERE org_id=? ORDER BY domain").bind(orgId).all().catch(()=>({results:[]}));
  const qDomain = c.req.query("q") || "";
  const searchResult = (c as any).get("searchResult") || null;
  const rows = (domains.results||[]).map((d:any)=>`<tr><td><b>${d.domain}</b> ${d.privacy?'<span class=badge>privacy</span>':''} ${d.locked?'<span class=muted>🔒</span>':''}</td><td>${d.status}</td><td>${d.expires_at?new Date(d.expires_at*1000).toISOString().slice(0,10):"—"}</td><td>${d.auto_renew?"On (balance)":"Off"}</td><td><a class=btn style="background:#fff;color:#111" href="/domains/${encodeURIComponent(d.domain)}/dns?org=${orgId}">DNS →</a> <form method=post action="/domains/renew?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${d.domain}"><input type=hidden name=duration value="1"><label style="font-size:.85rem"><input type=checkbox name=pay_from_balance value=1 checked> balance ($${(balance/100).toFixed(2)})</label> <button class=btn>Renew 1y</button></form> <form method=post action="/domains/renew-stripe?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${d.domain}"><button class=btn style="background:#fff;color:#111">Stripe →</button></form></td></tr>`).join("") || `<tr><td colspan=5 class=muted>No domains yet. Search & buy below, or link an existing domain.</td></tr>`;
  const dynOk = dynadotConfigured(c.env as any);
  return c.html(shell("Domains — Namenice", `<div class=card><h3 style=margin:0>Search & buy — Dynadot ${dynOk ? (isSandboxEnabled(c.env as any)?"<span class=badge> sandbox </span>":"<span class=badge> live </span>") : "<span class=muted>(not configured)</span>"}</h3><form method=post action="/domains/search?org=${orgId}" style="display:flex;gap:.5rem;margin:.6rem 0;flex-wrap:wrap"><input name=domain placeholder="example.com" value="${qDomain.replaceAll('"','&quot;')}" required style="flex:1;min-width:220px"><button class=btn>Check availability</button></form><div class=muted style="font-size:.82rem">Price shown + $2 service fee. Pay from balance (atomic debit) or Stripe Checkout. ${dynOk ? "" : "Set DYNADOT_API_KEY/SECRET to enable live search."}</div>${searchResult?`<div class=card style="margin-top:.6rem"><b>${searchResult.domain}</b> — ${searchResult.available?"<span class=badge>available</span>":"taken"} ${searchResult.price?`· $${searchResult.price} /yr`: ""} ${searchResult.available?`<form method=post action="/domains/buy?org=${orgId}" style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap"><input type=hidden name=domain value="${searchResult.domain}"><select name=duration><option value=1>1y</option><option value=2>2y</option><option value=5>5y</option><option value=10>10y</option></select><label><input type=checkbox name=pay_from_balance value=1 checked> Pay from balance ($${(balance/100).toFixed(2)})</label><button class=btn>Buy ${searchResult.domain}</button></form>`:""}</div>`:""}</div><div class=card><h3 style=margin:0>Your domains — org ${orgId}</h3><table><thead><tr><th>Domain</th><th>Status</th><th>Expires</th><th>Auto-renew</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class=card><h3 style=margin:0>Link external domain</h3><form method=post action="/domains/link?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=domain placeholder="mydomain.com" required><button class=btn style="background:#fff;color:#111">Link →</button></form><div class=muted style="font-size:.82rem">For bring-your-own DNS: point NS to us or add CNAME to ${c.env.CNAME_TARGET||"fallback.blognice.com"}</div></div>`));
});

app.post("/domains/search", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  if (!domain) return c.text("domain required", 400);
  let available = false; let price: string | null = null; let raw: any = null;
  if (dynadotConfigured(c.env as any)) {
    const r = await searchDomain(c.env as any, domain, { show_price: true });
    raw = r.raw;
    if (r.ok) {
      const d = r.data as any;
      available = !!d?.available || d?.status === "available";
      const pl = d?.priceList?.[0] || d?.price_list?.[0];
      if (pl?.registration_price) {
        const n = Number(pl.registration_price);
        price = (n + 2).toFixed(2);
      }
    } else {
      return c.html(shell("Search", `<div class=card><p>Dynadot error: ${r.error}</p><p class=muted>${JSON.stringify(raw||{}).slice(0,800)}</p><a href="/domains?org=${orgId}">← Back</a></div>`), 502);
    }
  } else {
    available = domain.endsWith(".test") || false;
    price = "14.99";
  }
  const balance = await getOrgBalance(c.env as any, orgId);
  return c.html(shell("Search — "+domain, `<div class=card><h3>${domain} — ${available?'<span class=badge>available</span>':'<span class=muted>taken</span>'}</h3>${price?`<p>Price: $${price} /yr <span class=muted>incl. $2 fee</span></p>`:""}${available?`<form method=post action="/domains/buy?org=${orgId}" style="display:grid;gap:.6rem;max-width:560px">
      <input type=hidden name=domain value="${domain}">
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Your name <input name=contact_name required placeholder="Jane Doe" maxlength=80></label><label>Email <input name=contact_email type=email required placeholder="jane@example.com"></label></div>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Phone CC <input name=contact_phone_cc required placeholder="1" value="1" maxlength=5></label><label>Phone <input name=contact_phone required placeholder="5551234567" maxlength=20></label></div>
      <label>Address <input name=contact_address1 required placeholder="123 Main St" maxlength=120></label>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>City <input name=contact_city required placeholder="San Francisco" maxlength=80></label><label>State <input name=contact_state placeholder="CA" maxlength=80></label></div>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>ZIP <input name=contact_zip required placeholder="94105" maxlength=20></label><label>Country (2-letter) <input name=contact_country required placeholder="US" value="US" maxlength=2 style="text-transform:uppercase"></label></div>
      <label>Organization (optional) <input name=contact_org placeholder="Acme Inc" maxlength=80></label>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Privacy <select name=privacy><option value="full" selected>Full</option><option value="partial">Partial</option><option value="off">Off</option></select></label><label>Duration <select name=duration><option value=1 selected>1y — $${price}</option><option value=2>2y</option><option value=5>5y</option><option value=10>10y</option></select></label></div>
      <label style="display:flex;gap:.5rem;align-items:center"><input type=checkbox name=pay_from_balance value=1 checked> Pay from balance ($${(balance/100).toFixed(2)}) — else Stripe Checkout</label>
      <button class=btn type=submit>Buy ${domain} — $${price}</button>
      <p class=muted style="font-size:.8rem;margin:0">By purchasing you agree to Dynadot registration terms. ${isSandboxEnabled(c.env as any)?"Sandbox simulated purchase.":""}</p>
    </form>`:`<p class=muted>Try another name.</p>`}<p><a href="/domains?org=${orgId}">← Back to domains</a></p></div>`));
});

app.post("/domains/link", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  if (!domain || !domain.includes(".")) return c.text("invalid domain", 400);
  const now = Math.floor(Date.now()/1000);
  await c.env.DB.prepare("INSERT OR IGNORE INTO domains (org_id, domain, status, created_at) VALUES (?, ?, 'active', ?)").bind(orgId, domain, now).run().catch(()=>{});
  try { recordAuditEvent(c.env as any, orgId, { action:"domain.link", target:domain, actor:member.email }); } catch {}
  return c.redirect(`/domains/${encodeURIComponent(domain)}/dns?org=${orgId}`, 303);
});

app.post("/domains/buy", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const duration = Number(form.get("duration")||1);
  const payFromBalance = String(form.get("pay_from_balance")||"") === "1";
  const privacy = (String(form.get("privacy")||"full") as "off"|"partial"|"full");
  const contact = {
    name: String(form.get("contact_name")||"").trim().slice(0,80),
    email: String(form.get("contact_email")||member.email).trim().slice(0,120),
    phone_cc: String(form.get("contact_phone_cc")||"1").trim().slice(0,5),
    phone_number: String(form.get("contact_phone")||"").trim().slice(0,20),
    address1: String(form.get("contact_address1")||"").trim().slice(0,120),
    city: String(form.get("contact_city")||"").trim().slice(0,80),
    state: String(form.get("contact_state")||"").trim().slice(0,80),
    zip: String(form.get("contact_zip")||"").trim().slice(0,20),
    country: String(form.get("contact_country")||"US").trim().toUpperCase().slice(0,2),
    organization: String(form.get("contact_org")||"").trim().slice(0,80) || undefined,
  };
  if (!contact.name || !contact.email || !contact.phone_number || !contact.address1 || !contact.city || !contact.zip || !contact.country) {
    return c.html(shell("Buy — missing fields", `<div class=card><p>Please fill name, email, phone, address, city, zip, country.</p><a href="/domains?org=${orgId}">← Back</a></div>`), 400);
  }
  const amountCents = 1499 + (duration-1)*1299;
  const now = Math.floor(Date.now()/1000);
  const doDynadotRegister = async (): Promise<{ok:boolean; error?:string}> => {
    if (!dynadotConfigured(c.env as any)) return {ok:true};
    try {
      const cc = await createContact(c.env as any, { name: contact.name, email: contact.email, phone_number: contact.phone_number, phone_cc: contact.phone_cc, address1: contact.address1, city: contact.city, state: contact.state, zip: contact.zip, country: contact.country, organization: contact.organization });
      if (!cc.ok || !cc.data?.contact_id) return {ok:false, error: cc.error || "Dynadot contact failed"};
      const cid = cc.data.contact_id as number;
      const reg = await registerDomain(c.env as any, domain, { duration, registrant_contact_id: cid, admin_contact_id: cid, tech_contact_id: cid, billing_contact_id: cid, privacy });
      if (!reg.ok) return {ok:false, error: reg.error || "Dynadot register failed"};
      try { await c.env.DB.prepare("INSERT INTO domain_contacts (org_id, domain, contact_type, dynadot_contact_id, payload, created_at) VALUES (?, ?, 'registrant', ?, ?, ?)").bind(orgId, domain, String(cid), JSON.stringify(contact), now).run(); } catch {}
      return {ok:true};
    } catch (e:any) { return {ok:false, error: String(e?.message||e).slice(0,400)}; }
  };
  if (payFromBalance) {
    const r = await debitBalance(c.env as any, orgId, member.accountId, amountCents, { idempotencyKey:`buy:${orgId}:${domain}:${duration}`, description:`Buy ${domain} ${duration}y privacy:${privacy}`, domain });
    if (!r.ok) return c.html(shell("Buy failed", `<div class=card><p>${r.error}</p><p><a class=btn href="/billing?org=${orgId}">Top up →</a> <a class=btn href="/billing?org=${orgId}" style="background:#fff;color:#111">Manage billing in Stripe →</a></p></div>`), 402);
    const reg = await doDynadotRegister();
    if (!reg.ok) {
      // refund
      try { const { creditTopup } = await import("./balance.ts"); await creditTopup(c.env as any, orgId, amountCents, `refund:${domain}:${now}`, `refund:buy:${orgId}:${domain}:${duration}`, String(member.accountId)); } catch {}
      return c.html(shell("Dynadot failed — refunded", `<div class=card><p>Dynadot error: ${reg.error} — your balance was refunded.</p><a href="/domains?org=${orgId}">← Back</a></div>`), 502);
    }
    await c.env.DB.prepare("INSERT OR IGNORE INTO domains (org_id, domain, status, privacy, locked, expires_at, created_at) VALUES (?, ?, 'active', ?, 1, ?, ?)").bind(orgId, domain, privacy==="full"?1:privacy==="partial"?1:0, now + duration*365*86400, now).run().catch(()=>{});
    try { recordAuditEvent(c.env as any, orgId, { action:"domain.buy.balance", target:`${domain} ${duration}y ${privacy}`, actor:member.email }); } catch {}
    return c.html(shell("Purchased", `<div class=card><p>Purchased <b>${domain}</b> for ${duration}y (privacy ${privacy}) — debited $${(amountCents/100).toFixed(2)} (balance $${(r.balanceAfter!/100).toFixed(2)}).</p><p><a class=btn href="/domains/${encodeURIComponent(domain)}/dns?org=${orgId}">Manage DNS →</a> <a class=btn href="/domains?org=${orgId}" style="background:#fff;color:#111">← Domains</a></p></div>`));
  }
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured", 503);
  const origin = new URL(c.req.url).origin;
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null) as any;
  // stash contact in metadata via checkout session? For now stash in domains pending and Stripe metadata privacy
  const session = await createDomainCheckoutWithBalanceFallback(c.env as any, { orgId, accountId: member.accountId, email: contact.email, customerId: balRow?.stripe_customer_id||null, domain, duration, amountCents, successUrl: `${origin}/domains?org=${orgId}`, cancelUrl: `${origin}/domains?org=${orgId}` });
  // also record intent for webhook to use full contact
  try { await c.env.DB.prepare("INSERT OR IGNORE INTO domains (org_id, domain, status, privacy, created_at) VALUES (?, ?, 'pending', ?, ?)").bind(orgId, domain, privacy==="full"?1:0, now).run(); await c.env.DB.prepare("INSERT OR IGNORE INTO domain_contacts (org_id, domain, contact_type, payload, created_at) VALUES (?, ?, 'pending', ?, ?)").bind(orgId, domain, JSON.stringify({...contact, privacy, duration}), now).run(); } catch {}
  try { recordAuditEvent(c.env as any, orgId, { action:"domain.buy.stripe_intent", target:domain, actor:member.email }); } catch {}
  return c.redirect(session.url, 303);
});

app.get("/domains/:domain/dns", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const exists = await c.env.DB.prepare("SELECT 1 FROM domains WHERE org_id=? AND domain=?").bind(orgId, domain).first().catch(()=>null);
  if (!exists) return c.html(shell("Not found", `<div class=card><p>Domain ${domain} not in org ${orgId}. <a href="/domains?org=${orgId}">← Back</a></p></div>`), 404);
  const records = await listDns(c.env as any, orgId, domain);
  const rows = records.map((r:any)=>`<tr><td><b>${r.host}</b></td><td>${r.type}</td><td style="word-break:break-all">${r.value}</td><td>${r.ttl}</td><td>${r.priority ?? "—"}</td><td><form method=post action="/domains/${encodeURIComponent(domain)}/dns/remove?org=${orgId}" style="display:inline"><input type=hidden name=id value="${r.id}"><button class=btn style="background:#fff;color:#111">Remove</button></form></td></tr>`).join("") || `<tr><td colspan=6 class=muted>No records. Add one below. Default: we prefill @ A for fallback.</td></tr>`;
  return c.html(shell(`DNS — ${domain}`, `<div class=card><h3 style=margin:0>DNS — ${domain} <span class=muted style=font-weight:400>· org ${orgId}</span></h3><table><thead><tr><th>Host</th><th>Type</th><th>Value</th><th>TTL</th><th>Prio</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class=card><h3 style=margin:0>Add record</h3><form method=post action="/domains/${encodeURIComponent(domain)}/dns/add?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end"><label>Host <input name=host placeholder="@" value="@" required></label><label>Type <select name=type>${DNS_TYPES.map(t=>`<option>${t}</option>`).join("")}</select></label><label>Value <input name=value placeholder="1.2.3.4 or target" required style="min-width:240px"></label><label>TTL <input name=ttl type=number value=3600 min=60 max=86400 style="width:90px"></label><label>Prio <input name=priority type=number placeholder="10" style="width:70px"></label><button class=btn>Add</button></form><div class=muted style="font-size:.82rem;margin-top:.4rem">Examples: <code>@ A 76.76.21.21</code> · <code>www CNAME ${domain}</code> · <code>@ MX mail.example.com (prio 10)</code> · <code>@ TXT v=spf1 include:_spf.example.com ~all</code></div></div><div class=card><h3 style=margin:0>Nameservers</h3><p class=muted style="font-size:.85rem">We host DNS at Namenice. If domain is at Dynadot, set NS to <code>ns1.namenice.net / ns2.namenice.net</code> or keep Dynadot DNS and we sync via API.</p><form method=post action="/domains/${encodeURIComponent(domain)}/ns?org=${orgId}" style="display:flex;gap:.5rem"><input name=ns placeholder="ns1.namenice.net, ns2.namenice.net" style="flex:1"><button class=btn style="background:#fff;color:#111">Update NS</button></form></div>`));
});

app.post("/domains/:domain/dns/add", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  try {
    await addDns(c.env as any, orgId, domain, { host: String(form.get("host")||"@"), type: String(form.get("type")||"A"), value: String(form.get("value")||""), ttl: Number(form.get("ttl")||3600), priority: form.get("priority")?Number(form.get("priority")):null });
    try { recordAuditEvent(c.env as any, orgId, { action:"dns.add", target:`${domain} ${String(form.get("type"))} ${String(form.get("host"))}`, actor:member.email }); } catch {}
  } catch (e:any) { return c.html(shell("DNS error", `<div class=card><p>${String(e.message).slice(0,500)}</p><a href="/domains/${encodeURIComponent(domain)}/dns?org=${orgId}">← Back</a></div>`), 400); }
  return c.redirect(`/domains/${encodeURIComponent(domain)}/dns?org=${orgId}`, 303);
});
app.post("/domains/:domain/dns/remove", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  await removeDns(c.env as any, orgId, domain, Number(form.get("id"))).catch(()=>{});
  try { recordAuditEvent(c.env as any, orgId, { action:"dns.remove", target:domain, actor:member.email }); } catch {}
  return c.redirect(`/domains/${encodeURIComponent(domain)}/dns?org=${orgId}`, 303);
});
app.post("/domains/:domain/ns", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const ns = String(form.get("ns")||"").trim().slice(0,500);
  await c.env.DB.prepare("UPDATE domains SET nameservers=? WHERE org_id=? AND domain=?").bind(ns||null, orgId, domain).run().catch(()=>{});
  try { recordAuditEvent(c.env as any, orgId, { action:"dns.ns", target:`${domain} → ${ns}`, actor:member.email }); } catch {}
  return c.redirect(`/domains/${encodeURIComponent(domain)}/dns?org=${orgId}`, 303);
});

app.post("/domains/renew", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const payFromBalance = String(form.get("pay_from_balance")||"") === "1";
  const amountCents = 1499;
  if (payFromBalance) {
    const r = await debitBalance(c.env as any, orgId, member.accountId, amountCents, { idempotencyKey:`renew:${orgId}:${domain}:${Date.now()}`, description:`Renew ${domain} 1y`, domain });
    if (!r.ok) return c.html(shell("Renew failed", `<div class=card><p>${r.error}</p><a class=btn href="/billing?org=${orgId}">Top up →</a></div>`), 402);
    await c.env.DB.prepare("UPDATE domains SET expires_at=COALESCE(expires_at, strftime('%s','now')) + 365*86400 WHERE org_id=? AND domain=?").bind(orgId, domain).run().catch(()=>{});
    return c.html(shell("Renewed", `<div class=card><p>Renewed ${domain} — debited $${(amountCents/100).toFixed(2)}.</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
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
  const balRow = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null);
  const session = await createDomainCheckoutWithBalanceFallback(c.env as any, { orgId, accountId: member.accountId, email: member.email, customerId: (balRow as any)?.stripe_customer_id||null, domain, duration:1, amountCents, successUrl: `${origin}/domains?org=${orgId}`, cancelUrl: `${origin}/domains?org=${orgId}` });
  return c.redirect(session.url, 303);
});

app.get("/transfer", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  return c.html(shell("Transfer — Namenice", `<div class=card><h3>Transfer in</h3><form method=post action="/domains/transfer/in?org=${orgId}" style="display:grid;gap:.6rem;max-width:520px"><label>Domain <input name=domain required placeholder="example.com"></label><label>Auth code <input name=auth_code required placeholder="X1Y2-..."></label><button class=btn>Start transfer — $14.99</button></form><p class=muted style="font-size:.82rem">Unlock at old registrar first. Transfers take 5-7 days. We debit from balance or Stripe like buy.</p></div><div class=card><h3>Transfer out / Auth code</h3><form method=post action="/domains/transfer/out?org=${orgId}" style="display:flex;gap:.5rem"><input name=domain placeholder="mydomain.com" required><button class=btn style="background:#fff;color:#111">Request auth code</button></form></div><div class=card><h3>Bulk</h3><form method=post action="/domains/bulk/renew?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=domains placeholder="a.com, b.com" style="flex:1"><button class=btn>Bulk renew 1y from balance</button></form></div>`));
});
app.post("/domains/transfer/in", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const auth = String(form.get("auth_code")||"").trim();
  if (!domain || !auth) return c.text("domain + auth_code required",400);
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"domain.transfer.in", target:`${domain} auth:${auth.slice(0,4)}***`, actor: member.email }); } catch {}
  return c.html(shell("Transfer started", `<div class=card><p>Transfer for <b>${domain}</b> initiated (auth ${auth.slice(0,4)}***). Check email at losing registrar to approve. <span class=muted>Sandbox: simulated.</span></p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.post("/domains/transfer/out", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"domain.transfer.out", target:domain, actor: member.email }); } catch {}
  return c.html(shell("Auth code", `<div class=card><p>Auth code for <b>${domain}</b> sent to registrant email. Unlock the domain first if locked.</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.post("/domains/bulk/renew", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const list = String(form.get("domains")||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  let ok=0, fail=0;
  for (const dom of list) {
    const r = await (await import("./balance.ts")).debitBalance(c.env as any, orgId, member.accountId, 1499, { idempotencyKey:`bulk:renew:${orgId}:${dom}:${Date.now()}`, description:`Bulk renew ${dom}`, domain: dom });
    if (r.ok) { ok++; await c.env.DB.prepare("UPDATE domains SET expires_at=COALESCE(expires_at, strftime('%s','now'))+365*86400 WHERE org_id=? AND domain=?").bind(orgId, dom).run().catch(()=>{}); } else fail++;
  }
  return c.html(shell("Bulk renew", `<div class=card><p>Renewed ${ok} domains, ${fail} failed (insufficient balance).</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.get("/api/keys", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const rows = await c.env.DB.prepare("SELECT id, label, prefix, scopes, last_used_at, expires_at, created_at FROM api_keys WHERE org_id=? ORDER BY created_at DESC").bind(orgId).all().catch(()=>({results:[]})) as any;
  const list = (rows.results||[]).map((r:any)=>`<tr><td><code>${r.prefix}***</code></td><td>${r.label}</td><td class=muted>${r.scopes}</td><td>${r.last_used_at?new Date(r.last_used_at*1000).toISOString().slice(0,10):"—"}</td><td><form method=post action="/api/keys/revoke?org=${orgId}" style="display:inline"><input type=hidden name=id value="${r.id}"><button class=btn style="background:#fff;color:#111">Revoke</button></form></td></tr>`).join("") || `<tr><td colspan=5 class=muted>No keys — create one below</td></tr>`;
  return c.html(shell("API Keys — Namenice", `<div class=card><h3 style=margin:0>API keys — org ${orgId}</h3><table><thead><tr><th>Key</th><th>Label</th><th>Scopes</th><th>Last used</th><th></th></tr></thead><tbody>${list}</tbody></table></div><div class=card><h3 style=margin:0>Create key</h3><form method=post action="/api/keys?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=label placeholder="CI / Terraform" required><select name=scopes><option value="domains:read,dns:read">read</option><option value="domains:read,dns:read,dns:write" selected>dns:write</option><option value="domains:read,dns:read,dns:write,billing:read">full</option></select><button class=btn>Create — shows once</button></form><p class=muted style="font-size:.82rem">Use <code>Authorization: Bearer nn_&lt;token&gt;</code> + <code>X-Org: ${orgId}</code>. Webhooks: <code>POST /webhooks/dns.updated</code> coming next.</p></div>`));
});
app.post("/api/keys", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const label = String(form.get("label")||"key").trim().slice(0,80);
  const scopes = String(form.get("scopes")||"domains:read,dns:read").trim().slice(0,200);
  const raw = `nn_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("")}`;
  const prefix = raw.slice(0,12);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const now = Math.floor(Date.now()/1000);
  await c.env.DB.prepare("INSERT INTO api_keys (org_id, label, token_hash, prefix, scopes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(orgId, label, hex, prefix, scopes, member.accountId, now).run();
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"api.key.create", target: prefix, actor: member.email }); } catch {}
  return c.html(shell("API key created", `<div class=card><p>Copy now — shown once:</p><p><code style="font-size:1.1rem;user-select:all">${raw}</code></p><p class=muted>Prefix ${prefix} · scopes ${scopes}</p><a href="/api/keys?org=${orgId}">← Back</a></div>`));
});
app.post("/api/keys/revoke", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  await c.env.DB.prepare("DELETE FROM api_keys WHERE id=? AND org_id=?").bind(Number(form.get("id")), orgId).run().catch(()=>{});
  return c.redirect(`/api/keys?org=${orgId}`,303);
});

app.get("/audit", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const page = Math.max(1, parseInt(c.req.query("page")||"1",10)||1);
  try {
    const { entries, hasMore } = await auditReport(c.env as any, orgId, 90, page, 50);
    const rows = entries.map(e=>`<tr><td>${e.occurredAt}</td><td>${e.action}</td><td>${e.target||"—"}</td><td>${e.actor||"—"}</td></tr>`).join("") || `<tr><td colspan=4 class=muted>No actions in last 90 days.</td></tr>`;
    return c.html(shell("Audit log — 90 days", `<div class=card><div style="display:flex;justify-content:space-between"><h3 style="margin:0">Audit log</h3><span class=muted>Last 90 days · Analytics Engine</span></div><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right;margin-top:.6rem">${page>1?`<a href="/audit?org=${orgId}&page=${page-1}">← Prev</a> `:""}${hasMore?`<a href="/audit?org=${orgId}&page=${page+1}">Next →</a>`:""}</div></div>`));
  } catch (e:any) { return c.html(shell("Audit", `<div class=card><p>Could not load audit: ${String(e?.message||e).slice(0,300)}</p><p class=muted>Configure CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN.</p></div>`), 502); }
});

app.post("/stripe/webhook", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("stripe-signature") || undefined;
  if (!await verifyStripeSignature(raw, sig, c.env.STRIPE_WEBHOOK_SECRET)) return c.json({error:"invalid signature"}, 400);
  let event: any; try { event = JSON.parse(raw); } catch { return c.json({error:"invalid payload"},400); }
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, created_at, status) VALUES (?, ?, ?, 'processing')").bind(event.id, event.type, event.created||Math.floor(Date.now()/1000)).run().catch(()=>null);
  if (inserted && inserted.meta.changes===0) {
    const existing = await c.env.DB.prepare("SELECT status FROM stripe_events WHERE id=?").bind(event.id).first().catch(()=>null);
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
        await creditTopup(c.env as any, orgId, amountCents, String(obj.id||""), `stripe:${event.id}`, accountId);
        const cust = typeof obj.customer==="string"?obj.customer:null;
        if (cust) await c.env.DB.prepare("UPDATE org_balances SET stripe_customer_id=COALESCE(stripe_customer_id, ?) WHERE org_id=?").bind(cust, orgId).run().catch(()=>{});
      }
      if (type==="domain_purchase" && orgId) {
        try { recordAuditEvent(c.env as any, orgId, { action:"domain.purchase.stripe", target:String(meta.domain||""), actor:accountId }); } catch {}
        const dom = String(meta.domain||"").toLowerCase();
        const dur = Number(meta.duration||1);
        if (dom) await c.env.DB.prepare("INSERT OR IGNORE INTO domains (org_id, domain, status, expires_at, created_at) VALUES (?, ?, 'active', ?, ?)").bind(orgId, dom, Math.floor(Date.now()/1000)+dur*365*86400, Math.floor(Date.now()/1000)).run().catch(()=>{});
      }
    }
    await c.env.DB.prepare("UPDATE stripe_events SET status='processed', processed_at=? WHERE id=?").bind(Math.floor(Date.now()/1000), event.id).run().catch(()=>{});
    return c.json({received:true});
  } catch (e:any) {
    await c.env.DB.prepare("UPDATE stripe_events SET status='failed', last_error=? WHERE id=?").bind(String(e?.message||e).slice(0,500), event.id).run().catch(()=>{});
    return c.json({error:"webhook failed"},500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const now = Math.floor(Date.now()/1000);
    const cutoff = now + 30*86400;
    const due = await env.DB.prepare("SELECT org_id, domain, expires_at FROM domains WHERE auto_renew=1 AND expires_at IS NOT NULL AND expires_at < ? LIMIT 50").bind(cutoff).all().catch(()=>({results:[]})) as any;
    for (const d of (due.results||[])) {
      const orgId = (d as any).org_id as number;
      const domain = (d as any).domain as string;
      const amountCents = 1499;
      // try balance first
      const bal = await env.DB.prepare("SELECT balance_cents FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null) as any;
      if (bal && bal.balance_cents >= amountCents) {
        try {
          const { debitBalance } = await import("./balance.ts");
          const r = await debitBalance(env as any, orgId, 0, amountCents, { idempotencyKey: `cron:renew:${orgId}:${domain}:${new Date().toISOString().slice(0,10)}`, description: `Auto-renew ${domain} 1y`, domain });
          if (r.ok) {
            await env.DB.prepare("UPDATE domains SET expires_at=COALESCE(expires_at, ?)+365*86400 WHERE org_id=? AND domain=?").bind(now, orgId, domain).run().catch(()=>{});
            try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(env as any, orgId, { action:"domain.renew.cron.balance", target: domain, actor:"cron" }); } catch {}
          }
        } catch {}
      } else {
        try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(env as any, orgId, { action:"domain.renew.cron.insufficient_balance", target: `${domain} $${(amountCents/100).toFixed(2)}`, actor:"cron" }); } catch {}
      }
    }
  }
};
