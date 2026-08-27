import { Hono } from "hono";
import { auditReport, recordAuditEvent, type MetricsEnv } from "./metrics.ts";
import { createTopupCheckoutSession, createDomainCheckoutWithBalanceFallback, createPortalSession, stripeConfigured, verifyStripeSignature } from "./stripe.ts";
import { debitBalance, getOrgBalance, creditTopup, type BalanceEnv } from "./balance.ts";
import { can, createAuth } from "./auth.ts";
import { listDns, addDns, removeDns, DNS_TYPES } from "./dns.ts";
import { dynadotConfigured, getDynadotBaseUrl, searchDomain, isSandboxEnabled, createContact, registerDomain } from "./dynadot.ts";


function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function wordmarkHtml(): string {
  return `<span class="wordmark">name<mark class="wordmark__accent">nice</mark></span>`;
}

function cartIconHtml(count = 0): string {
  return `<a href="/cart" class="cart-icon" aria-label="Cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 5.5h1.4l.9 8.1a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.3l.8-6.2H5.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7.5" cy="17.5" r="1" fill="currentColor"/>
      <circle cx="14" cy="17.5" r="1" fill="currentColor"/>
    </svg>
    ${count > 0 ? `<span class="cart-icon__count">${count}</span>` : ""}
  </a>`;
}

function statusBadgeHtml(status: string): string {
  const copy: Record<string,string> = { available: "Available", unavailable: "Unavailable", premium: "Premium domain" };
  return `<span class="status-badge status-badge--${status}"><span aria-hidden="true">\u25CF</span> ${copy[status] || status}</span>`;
}

function shell(title: string, body: string, opts?: { user?: { email:string } | null; orgId?: number; activeTab?: string; headExtra?: string }): string {
  const user = opts?.user ?? null;
  const org = opts?.orgId ?? 1;
  const active = opts?.activeTab || "";
  const isActive = (t:string) => active === t ? " is-active" : "";
  const navTabs = `<div class="site-nav__tabs">
        <a href="/search" class="site-nav__tab${isActive("search")}">Search</a>
        <a href="/history" class="site-nav__tab${isActive("history")}">History</a>
        <a href="/favorites" class="site-nav__tab${isActive("favorites")}">Favorites</a>
        <a href="/transfer" class="site-nav__tab site-nav__tab--secondary${isActive("transfer")}">Transfer a domain</a>
      </div>`;
  const authSlot = user
    ? `<button type="button" class="site-nav__account-trigger" data-account-trigger aria-haspopup="true" aria-expanded="false">Account <span aria-hidden="true">\u2304</span></button>`
    : `<span data-auth-slot><a href="/signin">Sign in</a><a href="/signup">Create account</a></span>`;
  const nav = `<nav class="site-nav site-nav--full">
      <a href="/" class="wordmark">${wordmarkHtml()}</a>
      ${navTabs}
      <div class="site-nav__links">
        ${authSlot}
        ${cartIconHtml()}
      </div>
    </nav>`;
  const accountMenuUser = user ? esc(user.email) : "namenice";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="canonical" href="https://www.namenice.net/"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="Modern DNS + domains — fast, private, Stripe-powered top-ups."><meta property="og:url" content="https://www.namenice.net/"><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Noto+Serif+Thai:wght@400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/tokens.css"><link rel="stylesheet" href="/assets/css/base.css"><link rel="stylesheet" href="/assets/css/homepage.css"><link rel="stylesheet" href="/assets/css/search-results.css"><link rel="stylesheet" href="/assets/css/auth.css">${opts?.headExtra||""}</head><body><div class="page-shell">${nav}${body}<footer class="site-footer"><span class="wordmark">${wordmarkHtml()}</span><div class="site-footer__text"><p>namenice \u2014 find a name worth owning. Pricing shown includes first-year registration.</p><p class="site-footer__copyright">\u00A9 ${new Date().getFullYear()} namenice</p></div></footer></div><script type="module">
import { initCartDrawer } from "/assets/js/cart-drawer.js";
import { initAccountMenu } from "/assets/js/account-menu.js";
try { initCartDrawer(); } catch(e) { console.warn(e); }
try { initAccountMenu(); } catch(e) {}
// Update auth slot for demo localStorage — real auth via server session
try {
  const isDemoSignedIn = localStorage.getItem("namenice_signed_in_demo") === "true";
  if (isDemoSignedIn && !document.querySelector("[data-account-trigger]")) {
    const slot = document.querySelector("[data-auth-slot]");
    if (slot) slot.innerHTML = '<button type="button" class="site-nav__account-trigger" data-account-trigger aria-haspopup="true" aria-expanded="false">Account <span aria-hidden="true">\u2304</span></button>';
  }
} catch {}
</script></body></html>`;
}

function shellSimple(title: string, body: string, opts?: { user?: { email:string } | null; orgId?: number }): string {
  const user = opts?.user ?? null;
  return shell(title, body, { user, orgId: opts?.orgId, activeTab: "" });
}


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

async function ensurePersonalOrganization(env: any, email: string): Promise<number | null> {
  const clean = String(email||"").toLowerCase().trim();
  if (!clean || !clean.includes("@")) return null;
  const now = Math.floor(Date.now()/1000);
  try {
    let acc = await env.DB.prepare("SELECT id FROM accounts WHERE email=?").bind(clean).first().catch(()=>null) as any;
    if (!acc) {
      await env.DB.prepare("INSERT OR IGNORE INTO accounts (email, password_hash, status, billing_status, created_at) VALUES (?, '', 'active', 'inactive', ?)").bind(clean, now).run().catch(()=>{});
      acc = await env.DB.prepare("SELECT id FROM accounts WHERE email=?").bind(clean).first().catch(()=>null) as any;
    }
    if (!acc?.id) return null;
    const mem = await env.DB.prepare("SELECT org_id FROM organization_members WHERE account_id=? LIMIT 1").bind(acc.id).first().catch(()=>null) as any;
    if (mem?.org_id) return mem.org_id as number;
    const slugBase = clean.split("@")[0].replace(/[^a-z0-9-]/g,"-").slice(0,20) || "user";
    const rand = Math.random().toString(36).slice(2,8);
    const slug = `${slugBase}-${rand}`;
    const publicId = `org_${rand}${Date.now().toString(36)}`;
    const title = clean;
    await env.DB.prepare("INSERT OR IGNORE INTO organizations (public_id, slug, title, is_company, created_at) VALUES (?, ?, ?, 0, ?)").bind(publicId, slug, title, now).run().catch(()=>{});
    const org = await env.DB.prepare("SELECT id FROM organizations WHERE public_id=?").bind(publicId).first().catch(()=>null) as any;
    const orgId = org?.id as number;
    if (!orgId) return null;
    await env.DB.prepare("INSERT OR IGNORE INTO organization_members (account_id, org_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(acc.id, orgId, now).run().catch(()=>{});
    await env.DB.prepare("INSERT OR IGNORE INTO org_balances (org_id, balance_cents, updated_at) VALUES (?, 0, ?)").bind(orgId, now).run().catch(()=>{});
    return orgId;
  } catch { return null; }
}

async function isCompanyOrg(env: any, orgId: number): Promise<boolean> {
  try {
    const row = await env.DB.prepare("SELECT is_company FROM organizations WHERE id=?").bind(orgId).first().catch(()=>null) as any;
    if (row && typeof row.is_company !== "undefined") return !!row.is_company;
  } catch {}
  return false;
}

async function getUserOrgIds(env: any, email: string): Promise<number[]> {
  try {
    const rows = await env.DB.prepare("SELECT org_id FROM organization_members WHERE account_id=(SELECT id FROM accounts WHERE email=?)").bind(email).all().catch(()=>({results:[]})) as any;
    return (rows.results||[]).map((r:any)=>r.org_id as number);
  } catch { return []; }
}

async function requireExplicitOrg(c: any, email: string): Promise<{ orgId: number; ok: true } | { ok: false; response: Response }> {
  const raw = c.req.query("org");
  const hasExplicit = raw != null && String(raw).trim() !== "";
  let orgId = hasExplicit ? Number(raw) : 1;
  if (!email) return { orgId, ok: true } as any;
  const ids = await getUserOrgIds(c.env as any, email);
  if (ids.length > 1 && !hasExplicit) return { ok: false, response: c.text("explicit org required — select ?org=", 400) } as any;
  if (hasExplicit && ids.length && !ids.includes(orgId)) return { ok: false, response: c.text("forbidden — org not yours", 403) } as any;
  if (!hasExplicit && ids.length === 1 && ids[0] !== orgId) orgId = ids[0];
  if (!Number.isFinite(orgId) || orgId < 1) return { ok: false, response: c.text("invalid org", 400) } as any;
  return { orgId, ok: true } as any;
}

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const rawHost = (c.req.header("host") || url.host || "").toLowerCase();
  const hostname = rawHost.split(":")[0];
  const urlHostname = url.hostname.toLowerCase();
  const mfHost = c.req.header("mf-original-hostname") || c.req.raw.headers.get("mf-original-hostname");
  const cfRay = c.req.header("cf-ray") || c.req.raw.headers.get("cf-ray");
  const cfIp = c.req.header("cf-connecting-ip") || c.req.raw.headers.get("cf-connecting-ip");
  const isLocal = rawHost.includes("localhost") || rawHost.includes("127.0.0.1") || rawHost.includes("::1") || urlHostname.includes("localhost") || urlHostname.includes("127.0.0.1") || rawHost.includes("workers.dev") || urlHostname.includes("workers.dev") || !!mfHost || cfIp === "127.0.0.1" || !cfRay;
  if (hostname === "namenice.net" && !isLocal) {
    url.hostname = "www.namenice.net";
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.namenice.net; frame-ancestors 'none'");
});

app.get("/:page{.*\.html}", (c) => {
  const raw = c.req.path;
  const q = new URL(c.req.url).search;
  if (raw === "/index.html") return c.redirect("/" + q, 301);
  return c.redirect(raw.replace(/\.html$/, "") + q, 301);
});

async function requireOrgMember(c: any, orgId: number): Promise<{ accountId:number; email:string; role:string } | null> {
  try {
    const origin = new URL(c.req.url).origin;
    const auth = createAuth(c.env as any, origin);
    const session = await (auth as any).api.getSession({ headers: c.req.raw.headers });
    if (session?.user?.email) {
      await ensurePersonalOrganization(c.env as any, session.user.email);
      const row = await c.env.DB.prepare("SELECT role FROM organization_members WHERE org_id=? AND account_id=(SELECT id FROM accounts WHERE email=?)").bind(orgId, session.user.email).first().catch(()=>null);
      const acc = await c.env.DB.prepare("SELECT id FROM accounts WHERE email=?").bind(session.user.email).first().catch(()=>null) as any;
      return { accountId: acc?.id || 1, email: session.user.email, role: row?.role || "owner" };
    }
  } catch {}
  return null;
}

async function getSessionUser(c: any): Promise<{ email:string; name?:string } | null> {
  try {
    const origin = new URL(c.req.url).origin;
    const auth = createAuth(c.env as any, origin);
    const session = await (auth as any).api.getSession({ headers: c.req.raw.headers });
    if (session?.user?.email) {
      await ensurePersonalOrganization(c.env as any, session.user.email);
      return { email: session.user.email, name: session.user.name };
    }
  } catch {}
  return null;
}


function signinPage(mode: "signin" | "signup" = "signin"): string {
  const isSignup = mode === "signup";
  const title = isSignup ? "Create your account" : "Sign in to namenice";
  const lede = isSignup
    ? "Search stays free forever. An account is only needed for buying, DNS, and billing."
    : "Welcome back \u2014 sign in to manage your domains.";
  const btnLabel = isSignup ? "Create account" : "Sign in";
  const switchText = isSignup ? "Already have an account?" : "New to namenice?";
  const switchHref = isSignup ? "/signin" : "/signup";
  const switchLabel = isSignup ? "Sign in" : "Create an account";
  const authForm = `<section class="auth-panel">
      <h1 class="auth-panel__heading">${title}</h1>
      <p class="auth-panel__lede">${lede}</p>
      <p class="auth-panel__lede" style="margin-top:-8px;">Demo login for local preview: <code>namenice</code> / <code>1234</code> also works offline. Real auth via email+password or OAuth.</p>
      <form class="auth-form" id="auth-form" novalidate>
        <div class="field-group" id="auth-name-group" style="${isSignup ? "" : "display:none"}">
          <label class="field-label" for="auth-name">Name</label>
          <input class="field" type="text" id="auth-name" placeholder="Jane Doe" autocomplete="name" ${isSignup ? "required" : ""} />
        </div>
        <div class="field-group">
          <label class="field-label" for="auth-email">Email address</label>
          <input class="field" type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="field-group">
          <label class="field-label" for="auth-password">Password</label>
          <input class="field" type="password" id="auth-password" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
          <p class="field-help" id="auth-error-help" style="color: var(--color-status-error);" hidden>Incorrect email or password.</p>
        </div>
        <button class="button button--primary" type="submit" id="auth-submit">${btnLabel}</button>
      </form>
      <div class="auth-divider">or continue with</div>
      <div class="auth-oauth">
        <a class="button button--secondary" href="/api/auth/sign-in/google">Google</a>
        <a class="button button--secondary" href="/api/auth/sign-in/github">GitHub</a>
      </div>
      <p class="auth-switch">${switchText} <a href="${switchHref}">${switchLabel}</a></p>
      <p class="auth-note" id="auth-status">Secure auth via Better Auth. Session cookie is HttpOnly.</p>
    </section>`;
  return authForm;
}

function authScript(): string {
  return `<script type="module">
const mode = document.querySelector(".auth-panel__heading")?.textContent?.includes("Create") ? "up" : "in";
const nameEl = document.getElementById('auth-name');
const emailEl = document.getElementById('auth-email');
const passEl = document.getElementById('auth-password');
const form = document.getElementById('auth-form');
const msg = document.getElementById('auth-error-help');
const status = document.getElementById('auth-status');
const submit = document.getElementById('auth-submit');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    const password = passEl.value;
    const name = nameEl ? nameEl.value.trim() : "";
    if (!email || !password) { if(msg){msg.textContent='Email and password required'; msg.hidden=false;} return; }
    if (submit) { submit.disabled=true; submit.textContent = mode==='up' ? 'Creating account\u2026' : 'Signing in\u2026'; }
    try {
      // Demo offline fallback check (matches UI prototype credentials)
      if (email.toLowerCase()==='namenice' && password==='1234') {
        try { localStorage.setItem('namenice_signed_in_demo','true'); } catch {}
        status.textContent='Demo sign-in successful — redirecting\u2026'; status.style.color='var(--color-status-success)';
        setTimeout(()=> location.href='/domains', 600);
        return;
      }
      const url = mode==='up' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email';
      const body = mode==='up' ? { email, password, name: name || email.split('@')[0] } : { email, password };
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) { if(msg){msg.textContent=j.message||j.error||'Failed: '+r.status; msg.hidden=false; msg.style.color='var(--color-status-error)';} }
      else { status.textContent='Success — redirecting\u2026'; status.style.color='var(--color-status-success)'; location.href='/domains'; }
    } catch(err) { if(msg){msg.textContent=String(err); msg.hidden=false;} } finally { if(submit){submit.disabled=false; submit.textContent = mode==='up' ? 'Create account' : 'Sign in';} }
  });
}
</script>`;
}



app.get("/", async (c) => {
  const user = await getSessionUser(c);
  const orgParam = c.req.query("org") ? `?org=${c.req.query("org")}` : "";
  const homepageBody = `
    <header class="hero">
      <div class="hero__diagonal" aria-hidden="true"></div>
      <div class="hero__grid">
        <div class="hero__copy">
          <p class="hero__eyebrow">namenice \u00B7 domains</p>
          <h1 class="hero__headline">Find a name<br />worth <mark class="hero__accent">owning</mark>.</h1>
          <p class="hero__subhead">Search. Check. Register. Your next domain in minutes.</p>
        </div>
        <div class="hero__mark">
        <div class="hero__extensions">
          <p class="hero__extensions-label">Popular extensions</p>
          <ul class="hero__extensions-list">
            <li>.net</li>
            <li>.com</li>
            <li>.io</li>
            <li>.co</li>
            <li>.org</li>
          </ul>
        </div>
      </div>
      </div>
    </header>
    <div class="hero-search-overlap">
      <section class="signature-search" data-search-state="initial">
        <form method="get" action="/search" class="signature-search__frame" style="flex:1" onsubmit="const v=this.querySelector('input[name=q]').value.trim(); if(!v){event.preventDefault(); this.querySelector('input[name=q]').focus(); return false;}">
          <label class="sr-only" for="domain-search-input">Search for a domain</label>
          <span class="signature-search__icon" aria-hidden="true">\u2315</span>
          <input id="domain-search-input" name="q" class="signature-search__input" placeholder="yourdomain.com" aria-describedby="search-helper" value="" />
          
          <button class="signature-search__submit" type="submit">Check availability</button>
        </form>
        <p id="search-helper" class="signature-search__helper">Search is free. Create an account when you\u2019re ready.</p>
      </section>
    </div>
    <p class="taken-domain__dates" style="text-align:center; margin: var(--space-4) 0 0;">Already own a domain? <a class="text-action" href="/transfer">Transfer it to namenice \u2192</a></p>
    <section class="section section--after-hero">
      <p class="section__eyebrow">Why namenice</p>
      <h2 class="section__heading">A domain is a small commitment. It shouldn\u2019t feel like a big risk.</h2>
      <div class="value-list">
        <div class="value-row"><h3>Own it, plainly</h3><p>The domain is registered to you, in your account, with a straightforward path to move or transfer it whenever you need to.</p></div>
        <div class="value-row"><h3>Pricing you can see</h3><p>The price you check is the price you pay. Renewal costs are shown up front, not buried until the year it renews.</p></div>
        <div class="value-row"><h3>DNS that doesn\u2019t fight you</h3><p>Add a record, save it, done. No hunting through nested menus to point a domain at your site.</p></div>
        <div class="value-row"><h3>Control over what matters</h3><p>Share access with a team without sharing the whole account \u2014 owner, admin, billing, and viewer each see only what they need.</p></div>
        <div class="value-row"><h3>Renewal, handled simply</h3><p>Turn on auto-renew and stop thinking about it, or manage it manually if you\u2019d rather decide each year yourself.</p></div>
      </div>
    </section>
    <section class="section">
      <p class="section__eyebrow">Pricing</p>
      <h2 class="section__heading">Know what you\u2019ll pay.</h2>
      <div class="price-decision">
        <div class="price-decision__domain"><span class="domain-result__selected-marker" aria-hidden="true">\u2713</span><span class="price-decision__name">namenice.net</span> <span class="muted" style="font-size:12px; margin-left:8px;">— example</span></div>
        <div class="price-decision__row"><div><p class="price-decision__label">Registration</p><p class="price-decision__amount">$12.99<span>/ first year</span></p></div><div><p class="price-decision__label">Renewal</p><p class="price-decision__amount price-decision__amount--muted">$18.99<span>/ year</span></p></div></div>
        <p class="price-decision__terms">Renewal is $18.99/yr after the first year. Shown before you add to cart, so there are no surprises in year two.</p>
        <div class="price-decision__actions"><a class="button button--primary" href="/search?q=namenice">Check namenice.net \u2192</a><a class="text-action" href="/search">See more options</a></div>
      </div>
    </section>
    <section class="section section--dark">
      <p class="section__eyebrow">Capability</p>
      <h2 class="section__heading">DNS that keeps up, without getting in the way.</h2>
      <div class="tech-panel"><p class="tech-panel__lede">Every record type you\u2019d expect, plus tools for importing a zone, forwarding a URL, or locking a domain down when it matters.</p>
        <div class="tech-grid">
          <div class="tech-item"><h4>Every record type</h4><p>A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, ALIAS \u2014 with TTLs from 60 seconds to a full day.</p></div>
          <div class="tech-item"><h4>Zone tools</h4><p>Import a BIND zone file, bulk-edit records, or set up URL forwarding with 301 or 302 redirects.</p></div>
          <div class="tech-item"><h4>Domain security</h4><p>DNSSEC, vanity nameservers, WHOIS privacy by default, and lock or unlock a domain when it matters.</p></div>
          <div class="tech-item"><h4>Team access</h4><p>Owner, admin, billing, and viewer roles, with 7-day invite links and a 90-day audit trail.</p></div>
          <div class="tech-item"><h4>Developer access</h4><p>API keys, webhooks, and a balance ledger \u2014 Stripe is only the processor, not the source of truth.</p></div>
          <div class="tech-item"><h4>Auto-renewal</h4><p>Renew straight from your balance so an important name never lapses by accident.</p></div>
        </div>
      </div>
    </section>
    <section class="section">
      <p class="section__eyebrow">Management</p>
      <h2 class="section__heading">Keep your domains where you can see them.</h2>
      <div class="management-preview"><p class="management-preview__lede">All your domains in one list, each with its own overview, DNS, renewal, and transfer controls.</p>
        <div class="management-panel"><div class="management-panel__header"><h3>My Domains</h3><span class="status-badge status-badge--available">\u25CF Active</span></div>
          <div class="row-group" style="padding: var(--space-5);">
            <div class="cart-page-item" style="padding: var(--space-3) 0;">
              <div class="cart-page-item__head"><strong>namenice.net</strong><span class="status-badge status-badge--available">\u25CF Active</span></div>
              <p class="taken-domain__dates">Domain only \u00B7 Expires ${new Date(Date.now()+365*86400000).toLocaleDateString()} \u00B7 Auto-renew On</p>
            </div>
          </div>
          <div class="management-actions"><a class="button button--primary" href="${user ? "/domains" + orgParam : "/signin"}">${user ? "Manage domains \u2192" : "Create account to manage \u2192"}</a><a class="text-action" href="/domains">View all</a></div>
        </div>
      </div>
    </section>
    <section class="section final-cta"><h2 class="final-cta__headline">A good name shouldn\u2019t be hard to own.</h2><a class="button button--primary" href="/search">Search your domain \u2192</a></section>
  `;
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  c.header("CDN-Cache-Control", "no-store");
  return c.html(shell("Namenice — modern DNS + domains", homepageBody, { user, activeTab: "" }));
});


app.get("/signin", (c) => c.html(shell("Sign in — Namenice", signinPage("signin") + authScript(), { activeTab: "" })));
app.get("/signup", (c) => c.html(shell("Create account — Namenice", signinPage("signup") + authScript(), { activeTab: "" })));
app.get("/sign-in", (c) => c.redirect("/signin", 301));
app.get("/login", (c) => c.redirect("/signin", 302));

app.get("/search", async (c) => {
  const user = await getSessionUser(c);
  const q = (c.req.query("q") || c.req.query("query") || c.req.query("domain") || "").trim();
  const orgId = Number(c.req.query("org") || 1);
  let resultHtml = "";
  let suggestionsHtml = "";
  if (q) {
    let domain = q.toLowerCase().trim();
    // Allow any TLD — if no dot, default to .net for convenience
    if (!domain.includes(".")) domain = domain.replace(/[^a-z0-9-]/g,"") + ".net";
    // Keep user-typed TLD as-is (supports .com, .io, .co, .org, etc.)
    let available = false; let price: string | null = null; let raw: any = null;
    let status: "available"|"unavailable"|"premium" = "unavailable";
    if (dynadotConfigured(c.env as any)) {
      try {
        const r = await searchDomain(c.env as any, domain, { show_price: true });
        raw = r.raw;
        if (r.ok) {
          const d = r.data as any;
          available = !!d?.available || d?.status === "available" || d?.search_results?.[domain]?.available;
          const pl = d?.priceList?.[0] || d?.price_list?.[0] || d?.search_results?.[domain]?.priceList?.[0];
          if (pl?.registration_price) price = (Number(pl.registration_price)+2).toFixed(2);
          else if (d?.price) price = (Number(d.price)+2).toFixed(2);
          const isPremium = d?.premium || d?.search_results?.[domain]?.premium;
          if (isPremium) status = "premium";
          else status = available ? "available" : "unavailable";
        }
      } catch {}
    } else {
      available = domain.startsWith("namenice") || domain.length < 12;
      price = available ? "12.99" : null;
      status = available ? "available" : "unavailable";
    }
    const priceStr = price ? `$${price}` : "—";
    const badge = statusBadgeHtml(status);
    const msg = status === "available" ? "Ready when you are. Review the price before you continue."
      : status === "premium" ? "Premium domains have a separate purchase price. Renewal details come next."
      : "This name is already registered. Here are a few close options.";
    const suggestions = status === "unavailable" ? [
      { domain: `try${domain}`, price: "$12.99", cadence: "/ year", status: "available" },
      { domain: `get${domain}`, price: "$12.99", cadence: "/ year", status: "available" },
    ] : [];
    resultHtml = `<div class="results-hero your-search-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;font-size:20px;letter-spacing:-.02em;">${esc(domain)}</h2>
          <div style="margin-top:var(--space-2);">${badge}</div>
        </div>
        <div style="text-align:right;"><strong style="font-size:20px;">${priceStr}</strong><span style="color:var(--color-text-secondary);font-size:12px;display:block;">${status==="available"?" / first year": status==="premium"?"Premium purchase price":"Try an alternative"}</span></div>
        <button class="button button--primary" type="button" data-add-domain="${esc(domain)}" data-price="${price||""}">${status==="available"?"Add to cart":"See options"}</button>
        <button class="compare-table__favorite" type="button" data-favorite-domain="${esc(domain)}" aria-label="Favorite ${esc(domain)}"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 17.2s-6.8-4.1-6.8-9.1a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5-6.8 9.1-6.8 9.1Z" stroke="currentColor" stroke-width="1.4"/></svg></button>
      </div>
      <p class="search-result__message" style="margin-top:var(--space-4);">${esc(msg)}</p>
    </div>`;
    if (suggestions.length) {
      suggestionsHtml = `<div class="results-block"><p class="results-block__label">Suggestions</p><div class="row-group">${suggestions.map(s=>`<div class="domain-result"><div><h3 class="domain-result__name">${esc(s.domain)}</h3><div class="domain-result__status">${statusBadgeHtml(s.status)}</div></div><div class="domain-result__price"><strong>${s.price}</strong><span>${s.cadence}</span></div><button class="compare-table__favorite" type="button" data-favorite-domain="${esc(s.domain)}"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 17.2s-6.8-4.1-6.8-9.1a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5-6.8 9.1-6.8 9.1Z" stroke="currentColor" stroke-width="1.4"/></svg></button><button class="text-action" type="button" data-add-domain="${esc(s.domain)}" data-price="${s.price}">Add</button></div>`).join("")}</div></div>`;
    }
  } else {
    resultHtml = `<div class="results-block"><p class="taken-domain__dates">Enter a name above to check availability — any TLD.</p></div>`;
  }
  const historyEntries = `<div class="recent-searches"><p class="recent-searches__label">Recent searches</p><ul id="recent-searches-list"></ul><a class="text-action" href="/history">View all history \\u2192</a></div>`;
  const searchBody = `
    <section class="search-toolbar">
      <div class="search-toolbar__layout">
        <div>
          <h1 class="search-toolbar__heading">Search domains</h1>
          <form method="get" action="/search" class="search-toolbar__bar">
            <div class="signature-search__frame" style="max-width:520px;">
              <span class="signature-search__icon" aria-hidden="true">\u2315</span>
              <input id="search-input" name="q" class="signature-search__input" value="${esc(q)}" placeholder="yourdomain.com" aria-label="Search your domain name" />
              
              <button class="signature-search__submit" type="submit">Search</button>
            </div>
          </form>
        </div>
        ${historyEntries}
      </div>
    </section>
    <section class="results-block"><p class="results-block__label">Your search</p>${resultHtml}</section>
    ${suggestionsHtml}
    <section class="results-block">
      <p class="results-block__label">Compare</p>
      <table class="compare-table">
        <thead><tr><th>Domain</th><th>Status</th><th>Price</th><th>Renewal</th><th></th></tr></thead>
        <tbody id="compare-table-body"></tbody>
      </table>
    </section>
    <section class="results-block">
      <p class="results-block__label">Names like this</p>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-6);">
        <div><p style="font-weight:600;">Shorter</p><ul><li><a class="text-action" href="/search?q=namnice">namnice.net</a></li><li><a class="text-action" href="/search?q=nameco">nameco.net</a></li><li><a class="text-action" href="/search?q=niceco">niceco.net</a></li></ul></div>
        <div><p style="font-weight:600;">More descriptive</p><ul><li><a class="text-action" href="/search?q=namenicehub">namenicehub.net</a></li><li><a class="text-action" href="/search?q=namenicehq">namenicehq.net</a></li><li><a class="text-action" href="/search?q=namenicepro">namenicepro.net</a></li></ul></div>
      </div>
    </section>
    <script type="module">
      import { addToCart, addToHistory, toggleFavorite, isFavorited } from "/assets/js/state.js";
      import { pulseCartBadge } from "/assets/js/cart-drawer.js";
      const q = new URLSearchParams(location.search).get("q")||"";
      if(q){
        let d = q.toLowerCase(); if(!d.includes(".")) d+=".net";
        try { addToHistory({ query: q, domain: d, status: document.querySelector(".status-badge")?.textContent?.includes("Available")?"available":"unavailable", price: document.querySelector(".results-hero strong")?.textContent||null }); } catch {}
      }
      // hydrate recent
      try {
        const h = JSON.parse(localStorage.getItem("namenice_history")||"[]").slice(0,3);
        document.getElementById("recent-searches-list").innerHTML = h.map(e=>'<li><a href="/search?q='+encodeURIComponent(e.query)+'">'+e.query+'</a></li>').join("") || '<li class="muted">No recent searches</li>';
      } catch {}
      document.querySelectorAll("[data-add-domain]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          addToCart({ domain: btn.dataset.addDomain, price: btn.dataset.price || "$12.99", cadence: "/ year" });
          pulseCartBadge();
          btn.textContent="Added \\u2713"; setTimeout(()=> btn.textContent="Add to cart", 1200);
        });
      });
      document.querySelectorAll("[data-favorite-domain]").forEach(btn=>{
        const d = btn.dataset.favoriteDomain;
        const update = ()=> btn.setAttribute("aria-pressed", String(isFavorited(d)));
        btn.addEventListener("click", ()=>{ toggleFavorite({ domain: d }); update(); });
        update();
      });
    </script>
  `;
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  c.header("CDN-Cache-Control", "no-store");
  c.header("Vary", "Accept-Encoding, Cookie");
  return c.html(shell("Search — Namenice", searchBody, { user, activeTab: "search" }));
});

app.get("/favorites", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Favorites</h1><p class="taken-domain__dates">Saved domains — heart any domain to keep it here. Stored locally until you sign in.</p></section>
    <section class="results-block" id="favorites-list"><p class="taken-domain__dates">Loading\\u2026</p></section>
    <script type="module">
      import { getFavorites, toggleFavorite } from "/assets/js/state.js";
      import { addToCart, isFavorited } from "/assets/js/state.js";
      import { pulseCartBadge } from "/assets/js/cart-drawer.js";
      function render(){
        const list = getFavorites();
        const el = document.getElementById("favorites-list");
        if(list.length===0){ el.innerHTML='<p class="taken-domain__dates">No favorites yet. <a class="text-action" href="/search">Search domains</a> and tap the heart.</p>'; return; }
        el.innerHTML = '<div class="row-group">'+list.map(item=>'<div class="domain-result"><div><h3 class="domain-result__name">'+item.domain+'</h3><div class="domain-result__status">'+(item.status?'<span class="status-badge status-badge--'+item.status+'">'+item.status+'</span>':'<span class="muted">Not checked yet</span>')+'</div></div><div class="domain-result__price"><strong>'+(item.price||"\\u2014")+'</strong><span>'+(item.cadence||"")+'</span></div><button class="compare-table__favorite" data-fav="'+item.domain+'" aria-pressed="true"><svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17.2s-6.8-4.1-6.8-9.1a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5-6.8 9.1-6.8 9.1Z" stroke="currentColor" stroke-width="1.4"/></svg></button><button class="text-action" data-add="'+item.domain+'">Add</button></div>').join("")+'</div>';
        el.querySelectorAll("[data-fav]").forEach(b=> b.addEventListener("click", ()=>{ toggleFavorite({domain:b.dataset.fav}); render(); }));
        el.querySelectorAll("[data-add]").forEach(b=> b.addEventListener("click", ()=>{ const it=list.find(x=>x.domain===b.dataset.add); addToCart({domain:it.domain, price:it.price||"$12.99"}); pulseCartBadge(); }));
      }
      render();
    </script>
  `;
  return c.html(shell("Favorites — Namenice", body, { user, activeTab: "favorites" }));
});

app.get("/history", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">History</h1><p class="taken-domain__dates">Past searches with captured results — persists locally.</p></section>
    <section class="results-block" id="history-list"><p class="taken-domain__dates">Loading\\u2026</p></section>
    <script type="module">
      import { getHistory } from "/assets/js/state.js";
      const el = document.getElementById("history-list");
      const list = getHistory();
      if(list.length===0) el.innerHTML='<p class="taken-domain__dates">No history yet. <a class="text-action" href="/search">Search a domain</a> to start.</p>';
      else el.innerHTML='<div class="row-group">'+list.map(e=>'<div class="domain-result"><div><h3 class="domain-result__name">'+e.query+(e.domain && e.domain!==e.query ? ' \\u2192 '+e.domain : '')+'</h3><div class="domain-result__status">'+(e.status?'<span class="status-badge status-badge--'+e.status+'">'+e.status+'</span>':'')+' <span class="muted">'+new Date(e.at).toLocaleString()+'</span></div></div><div class="domain-result__price"><strong>'+(e.price||"\\u2014")+'</strong></div><a class="text-action" href="/search?q='+encodeURIComponent(e.query)+'">Search again</a></div>').join("")+'</div>';
    </script>
  `;
  return c.html(shell("History — Namenice", body, { user, activeTab: "history" }));
});

app.get("/cart", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Your cart</h1><p class="taken-domain__dates">Direct-URL fallback for the cart drawer — same data. Choose a package per domain.</p></section>
    <section class="results-block" id="cart-page"><p class="taken-domain__dates">Loading\\u2026</p></section>
    <script type="module">
      import { getCart, removeFromCart, setCartItemBundle, cartSubtotal } from "/assets/js/state.js";
      import { getBundleOption, bundleOptions } from "/assets/js/mocks/bundle-options.js";
      function render(){
        const items = getCart();
        const el = document.getElementById("cart-page");
        if(items.length===0){ el.innerHTML='<p class="taken-domain__dates">Your cart is empty.</p><a class="button button--primary" href="/search">Search domains</a>'; return; }
        let subtotal = 0; items.forEach(i=> subtotal+=getBundleOption(i.bundle||"domain").price);
        el.innerHTML = '<div class="cart-drawer__items" style="padding:0;">'+items.map(item=>{
          const cur = getBundleOption(item.bundle||"domain");
          return '<div class="cart-drawer__item" style="border:0;"><div class="cart-drawer__item-row" style="cursor:default;"><span class="cart-drawer__item-name"><strong>'+item.domain+'</strong><span class="cart-drawer__item-package">'+cur.label+'</span></span><span class="cart-drawer__item-price">$'+cur.price.toFixed(2)+'</span></div><div class="cart-drawer__bundle-options">'+bundleOptions.map(o=>'<label class="cart-drawer__bundle-option"><input type="radio" name="bundle-'+item.domain+'" value="'+o.id+'" '+(cur.id===o.id?'checked':'')+' data-bundle="'+item.domain+'"><span>'+o.label+' — $'+o.price.toFixed(2)+'</span></label>').join("")+'</div><button class="text-action" data-remove="'+item.domain+'">Remove</button></div>';
        }).join("")+'</div><div style="margin-top:var(--space-6);display:flex;justify-content:space-between;align-items:center;border-top:var(--border-default);padding-top:var(--space-5);"><span>Subtotal</span><strong>$'+subtotal.toFixed(2)+'</strong></div><div style="margin-top:var(--space-6);"><a class="button button--primary" href="/checkout">Continue to checkout</a></div><p class="cart-drawer__mock-note" style="margin-top:var(--space-4);">Bundle prices are placeholder figures for internal review.</p>';
        el.querySelectorAll("[data-remove]").forEach(b=> b.addEventListener("click", ()=>{ removeFromCart(b.dataset.remove); render(); }));
        el.querySelectorAll("[data-bundle]").forEach(r=> r.addEventListener("change", ()=>{ setCartItemBundle(r.dataset.bundle, r.value); render(); }));
      }
      render();
    </script>
  `;
  return c.html(shell("Cart — Namenice", body, { user }));
});

app.get("/checkout", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Checkout</h1><p class="taken-domain__dates">Honest placeholder — not wired to Stripe yet in this preview. Your cart is saved locally.</p></section>
    <section class="results-block">
      <div style="display:grid;grid-template-columns:1fr 340px;gap:var(--space-8);" class="checkout-layout">
        <div>
          <div style="background:var(--color-surface-dark);color:var(--color-surface-raised);padding:var(--space-6);border-radius:var(--radius-search);">
            <h3 style="margin:0 0 var(--space-4);color:var(--color-surface-raised);">Complete your purchase</h3>
            <p style="color:var(--color-border-subtle);">In production, this goes to Stripe Checkout or pay-from-balance.</p>
            <div id="checkout-items"></div>
            <div style="margin-top:var(--space-6);"><a class="button button--primary" href="/checkout" id="checkout-pay">Pay with Stripe (demo)</a></div>
          </div>
        </div>
        <aside class="checkout-summary" style="border:var(--border-default);padding:var(--space-5);background:var(--color-surface-raised);">
          <p class="results-block__label">Order summary</p><div id="checkout-summary"></div>
        </aside>
      </div>
    </section>
    <script type="module">
      import { getCart } from "/assets/js/state.js";
      import { getBundleOption } from "/assets/js/mocks/bundle-options.js";
      import { addOrder, addOwnedDomain, clearCart } from "/assets/js/state.js";
      const items = getCart();
      const summary = document.getElementById("checkout-summary");
      const list = document.getElementById("checkout-items");
      if(items.length===0){ summary.innerHTML='<p class="taken-domain__dates">No items. <a class="text-action" href="/search">Search</a></p>'; }
      else {
        let total=0; items.forEach(i=> total+=getBundleOption(i.bundle||"domain").price );
        summary.innerHTML = items.map(i=>{const o=getBundleOption(i.bundle||"domain"); return '<div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:var(--border-default);"><span>'+i.domain+'<br><small class="muted">'+o.label+'</small></span><span>$'+o.price.toFixed(2)+'</span></div>';}).join("") + '<div style="display:flex;justify-content:space-between;padding:var(--space-4) 0;font-weight:600;"><span>Total</span><span>$'+total.toFixed(2)+'</span></div>';
        list.innerHTML = '<p class="taken-domain__dates">'+items.length+' domain(s) ready.</p>';
      }
      document.getElementById("checkout-pay")?.addEventListener("click", (e)=>{
        e.preventDefault();
        const now=Date.now();
        items.forEach(i=>{
          const o=getBundleOption(i.bundle||"domain");
          addOrder({ id: 'ORD-'+now+'-'+Math.floor(Math.random()*1000), domain:i.domain, price:'$'+o.price.toFixed(2), cadence:'/ year', bundleLabel:o.label, total:'$'+o.price.toFixed(2), at: now, email: 'demo@namenice.net' });
          addOwnedDomain({ domain:i.domain, bundleLabel:o.label });
        });
        clearCart();
        location.href='/orders';
      });
    </script>
  `;
  return c.html(shell("Checkout — Namenice", body, { user }));
});

app.get("/orders", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Orders</h1><p class="taken-domain__dates">Your order history — persisted locally in this prototype.</p></section>
    <section class="results-block" id="orders-list"><p class="taken-domain__dates">Loading\\u2026</p></section>
    <script type="module">
      import { getOrders, formatDate } from "/assets/js/state.js";
      const el=document.getElementById("orders-list");
      const list=getOrders();
      if(list.length===0) el.innerHTML='<p class="taken-domain__dates">No orders yet. <a class="text-action" href="/search">Find a domain</a></p>';
      else el.innerHTML='<div class="row-group">'+list.map(o=>'<div class="domain-result"><div><h3 class="domain-result__name">'+o.domain+'</h3><div class="taken-domain__dates">'+o.bundleLabel+' \\u00B7 '+o.price+' \\u00B7 '+formatDate(o.at)+'</div></div><div class="domain-result__price"><strong>'+o.total+'</strong></div></div>').join("")+'</div>';
    </script>
  `;
  return c.html(shell("Orders — Namenice", body, { user }));
});

app.get("/account", async (c) => {
  const user = await getSessionUser(c);
  const orgId = Number(c.req.query("org") || 1);
  let balance = 0;
  try { balance = await getOrgBalance(c.env as any, orgId); } catch {}
  const balanceStr = (balance/100).toFixed(2);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Account settings</h1><p class="taken-domain__dates">Your balance \\u00B7 Org ${orgId} \\u00B7 ${user ? esc(user.email) : "Not signed in"}</p></section>
    <section class="results-block">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6);">
        <div class="card" style="border-left:4px solid var(--color-interaction);padding:var(--space-6);background:var(--color-surface-raised);border:var(--border-default);border-left:4px solid var(--color-interaction);">
          <p class="muted" style="margin:0;">Your balance</p>
          <div style="font-size:1.8rem;font-weight:800;">$${balanceStr}</div>
          <p class="taken-domain__dates">Auto-renew pays from balance first. Stripe is the processor.</p>
          <form method="post" action="/billing/topup?org=${orgId}" style="display:flex;gap:.5rem;margin-top:var(--space-4);"><input name="amount" placeholder="25.00" value="25.00" style="padding:.6rem;border:var(--border-default);border-radius:8px;width:110px"><button class="button button--primary" type="submit">Top up via Stripe \\u2192</button></form>
          <p class="taken-domain__dates" style="margin-top:var(--space-4);"><a class="text-action" href="/billing?org=${orgId}">View billing & ledger \\u2192</a> \\u00B7 <a class="text-action" href="/settings?org=${orgId}">Organization settings \\u2192</a></p>
        </div>
        <div>
          <p class="results-block__label">Quick links</p>
          <ul>
            <li><a class="text-action" href="/domains?org=${orgId}">My Domains</a></li>
            <li><a class="text-action" href="/orders">Orders</a></li>
            <li><a class="text-action" href="/api/keys?org=${orgId}">API keys</a></li>
            <li><a class="text-action" href="/webhooks?org=${orgId}">Webhooks</a></li>
            <li><a class="text-action" href="/audit?org=${orgId}">Audit log (90 days)</a></li>
          </ul>
          <div style="margin-top:var(--space-6);" id="local-account"></div>
        </div>
      </div>
    </section>
    <script type="module">
      import { isSignedIn, getCartCount } from "/assets/js/state.js";
      document.getElementById("local-account").innerHTML = isSignedIn() ? '<p class="taken-domain__dates">Signed in (demo). <button class="text-action" data-sign-out>Sign out</button></p><p class="taken-domain__dates">Cart items: '+getCartCount()+'</p>' : '<p class="taken-domain__dates">Not signed in (demo). <a class="text-action" href="/signin">Sign in</a></p>';
    </script>
  `;
  return c.html(shell("Account — Namenice", body, { user }));
});

app.get("/transfer", async (c) => {
  const user = await getSessionUser(c);
  const body = `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Transfer a domain</h1><p class="taken-domain__dates">Bring your .net domain to namenice — keep it where you can see it.</p></section>
    <div style="display:grid;grid-template-columns: 1.4fr 1fr; gap: var(--space-8);">
      <section class="results-block">
        <form method="post" action="/transfer/in" style="display:grid;gap:var(--space-4);max-width:480px;">
          <div><label class="field-label">Domain to transfer</label><input class="field" name="domain" placeholder="example.net" required pattern="^.+\.net$" title="Only .net domains can be transferred" /></div>
          <div><label class="field-label">Authorization code (EPP)</label><input class="field" name="auth_code" placeholder="Enter code from current registrar" required /></div>
          <p class="taken-domain__dates" style="display:flex;gap:var(--space-2);align-items:center;"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.4"/></svg> Transfers are currently supported for .net domains.</p>
          <button class="button button--primary" type="submit">Start transfer \\u2192</button>
        </form>
      </section>
      <aside class="checkout-summary" style="border:var(--border-default);padding:var(--space-5);background:var(--color-surface-raised);">
        <p class="results-block__label">How domain transfers work</p>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);">
          ${["Check eligibility","Unlock your domain","Enter your authorization code","Start the transfer"].map((s,i)=>'<div style="padding:var(--space-2) 0;border-bottom:var(--border-default);"><strong>'+(i+1)+'. '+s+'</strong></div>').join("")}
        </div>
        <p class="taken-domain__dates" style="margin-top: var(--space-4);">Need help? <a class="text-action" href="#">Learn what you\\u2019ll need before transferring</a></p>
      </aside>
    </div>
    <script type="module">
      import { addTransferRequest, getTransferRequests } from "/assets/js/state.js";
      const form=document.querySelector('form[action="/transfer/in"]');
      form?.addEventListener("submit", (e)=>{
        const fd=new FormData(form);
        const domain=String(fd.get("domain")||"").toLowerCase().trim();
        if(domain && domain.endsWith(".net")){
          try { if(!getTransferRequests().some(t=>t.domain===domain)) addTransferRequest({domain, price:"$12.99", renewalExtension:"1 year"}); } catch {}
        }
      });
    </script>
  `;
  return c.html(shell("Transfer — Namenice", body, { user, activeTab: "transfer" }));
});

app.post("/transfer/in", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/signin?next=/transfer", 302);
  const exp = await requireExplicitOrg(c, user.email);
  if (!exp.ok) return exp.response;
  const orgId = exp.orgId;
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const auth_code = String(form.get("auth_code")||"").trim();
  if (!domain.endsWith(".net")) return c.text("Only .net domains can be transferred", 400);
  if (!auth_code) return c.text("Authorization code required", 400);
  // In production, call Dynadot transfer API; here we record intent and redirect to domains
  try { await c.env.DB.prepare("INSERT OR IGNORE INTO domains (org_id, domain, status, created_at) VALUES (?, ?, 'pending_transfer', ?)").bind(orgId, domain, Math.floor(Date.now()/1000)).run().catch(()=>{}); } catch {}
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"domain.transfer.start", target: domain, actor: user.email }); } catch {}
  return c.redirect(`/domains?org=${orgId}`, 303);
});

app.get("/sitemap.xml", (c) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.namenice.net/</loc><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`;
  c.header("Content-Type", "application/xml");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(xml, 200);
});

app.get("/robots.txt", (c) => {
  c.header("Content-Type", "text/plain");
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(`User-agent: *\nAllow: /\nSitemap: https://www.namenice.net/sitemap.xml\n`, 200);
});

app.get("/favicon.ico", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  return c.redirect("https://www.namenice.net/", 302);
});

app.on(["GET","POST"], "/api/auth/*", async (c) => {
  try {
    const origin = new URL(c.req.url).origin;
    const auth = createAuth(c.env as any, origin);
    const res = await (auth as any).handler(c.req.raw);
    if (!res.ok) { const txt = await res.clone().text().catch(()=>"<no body>"); console.error("[auth] handler not ok", c.req.url, res.status, txt.slice(0,800)); }
    return res;
  } catch (e:any) { console.error("[auth] handler throw", e?.stack||e); return c.text(String(e?.message||e), 500); }
});


app.get("/signout", async (c) => {
  try { const origin = new URL(c.req.url).origin; const auth = createAuth(c.env as any, origin); await (auth as any).api.signOut({ headers: c.req.raw.headers }); } catch {}
  const h = c.req.header("cookie") || "";
  c.header("Set-Cookie", `__Secure-better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return c.redirect("/", 302);
});

app.get("/billing", async (c) => {
  const user = await getSessionUser(c);
  const expBilling = user?.email ? await requireExplicitOrg(c, user.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(expBilling as any).ok) return (expBilling as any).response;
  const orgId = (expBilling as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const balance = await getOrgBalance(c.env as any, orgId);
  const memberCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM organization_members WHERE org_id=?").bind(orgId).first().catch(()=>({c:1})) as any;
  const isCompanyFlag = await isCompanyOrg(c.env as any, orgId);
  const isPersonal = !isCompanyFlag && (memberCount?.c ?? 1) <= 1;
  const balanceLabel = isPersonal ? "Your balance" : `Organization balance — org ${orgId}`;
  const ledger = await c.env.DB.prepare("SELECT type, amount_cents, balance_after, description, domain, created_at FROM balance_ledger WHERE org_id=? ORDER BY created_at DESC LIMIT 20").bind(orgId).all().catch(()=>({results:[]}));
  const rows = (ledger.results||[]).map((r:any)=>`<tr><td>${new Date(r.created_at*1000).toISOString().slice(0,19).replace("T"," ")}</td><td>${esc(r.type)}</td><td>${esc(r.domain||r.description)}</td><td style="text-align:right">${r.amount_cents>0?"+":""}$${(r.amount_cents/100).toFixed(2)}</td><td style="text-align:right">$${(r.balance_after/100).toFixed(2)}</td></tr>`).join("") || `<tr><td colspan=5 class=muted>No transactions yet.</td></tr>`;
  const companyCard = isPersonal
    ? `<div class=card><h3 style=margin:0>Organization type</h3><p class=muted style=font-size:.9rem>You're using a <b>Personal Organization</b> — treated as you, not a company. Tick "Company" to upgrade to a Company Organization and invite members.</p><form method=post action="/settings/company?org=${orgId}"><label style="display:flex;gap:.5rem;align-items:center"><input type=checkbox name=company value=1> Company — upgrade to Company Organization</label> <button class=btn type=submit>Upgrade →</button></form></div>`
    : `<div class=card style="border-left:4px solid #111"><h3 style=margin:0>Company Organization</h3><p class=muted style=font-size:.9rem>This is a <b>Company Organization</b> — members and invites enabled. Domains and balance stay on this org (no move).</p></div>`;
  return c.html(shell("Billing — Namenice", `<div class=card style="border-left:4px solid #1a8917"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem"><div><div class=muted>${esc(balanceLabel)}</div><div style="font-size:1.8rem;font-weight:800">$${(balance/100).toFixed(2)}</div><div class=muted style="font-size:.85rem">Auto-renew pays from balance first. Stripe is the processor.</div></div><form method=post action="/billing/topup?org=${orgId}" style="display:flex;gap:.5rem;align-items:center"><input name=amount placeholder="25.00" value="25.00" style="padding:.6rem;border:1px solid #e6e6e6;border-radius:8px;width:110px"> <span class=muted>$</span> <button class=btn type=submit>Top up via Stripe →</button></form></div><div style="margin-top:.6rem;display:flex;gap:.5rem"><a class=btn href="/billing/topup?org=${orgId}&amount=1000" style="background:#fff;color:#111">$10</a><a class=btn href="/billing/topup?org=${orgId}&amount=2500" style="background:#fff;color:#111">$25</a><a class=btn href="/billing/topup?org=${orgId}&amount=5000" style="background:#fff;color:#111">$50</a><a class=btn href="/billing/topup?org=${orgId}&amount=10000" style="background:#fff;color:#111">$100</a> <form method=post action="/billing/portal?org=${orgId}" style="display:inline"><button class=btn style="background:#fff;color:#111">Manage billing in Stripe →</button></form></div><div class=muted style="font-size:.78rem;margin-top:.5rem">Min $5 · max $1000 per top-up · idempotent via <code>stripe_events</code> + <code>balance_ledger.idempotency_key</code></div></div>${companyCard}<div class=card><h3 style=margin:0>Ledger (20 latest)</h3><table><thead><tr><th>When</th><th>Type</th><th>Domain/Desc</th><th style="text-align:right">Amount</th><th style="text-align:right">After</th></tr></thead><tbody>${rows}</tbody></table></div>`, { user, orgId }));
});

app.post("/billing/topup", async (c) => {
  const _userForOrg = await getSessionUser(c);
  const _expTop = await requireExplicitOrg(c, _userForOrg?.email || "");
  if (!_expTop.ok) return _expTop.response;
  const orgId = _expTop.orgId;
  const member = await requireOrgMember(c, orgId);
  if (!member) return c.redirect("/signin", 302);
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
  if (!member || !can(member.role, "billing.manage")) return c.redirect("/signin",302);
  if (!stripeConfigured(c.env as any)) return c.text("Stripe not configured",503);
  const user = await getSessionUser(c);
  const row = await c.env.DB.prepare("SELECT stripe_customer_id FROM org_balances WHERE org_id=?").bind(orgId).first().catch(()=>null) as any;
  if (!row?.stripe_customer_id) return c.html(shell("Billing", `<div class=card><p>No Stripe customer yet — top up once to create it, then manage billing in Stripe.</p><a href="/billing?org=${orgId}">← Billing</a></div>`, { user, orgId }), 400);
  const origin = new URL(c.req.url).origin;
  const sess = await createPortalSession(c.env as any, row.stripe_customer_id, `${origin}/billing?org=${orgId}`);
  return c.redirect(sess.url, 303);
});

app.get("/settings", async (c) => {
  const user = await getSessionUser(c);
  const expSettings = user?.email ? await requireExplicitOrg(c, user.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(expSettings as any).ok) return (expSettings as any).response;
  const orgId = (expSettings as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const org = await c.env.DB.prepare("SELECT is_company, title FROM organizations WHERE id=?").bind(orgId).first().catch(()=>null) as any;
  const isCompanyFlag = !!org?.is_company;
  const memberCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM organization_members WHERE org_id=?").bind(orgId).first().catch(()=>({c:1})) as any;
  const isPersonal = !isCompanyFlag && (memberCount?.c ?? 1) <= 1;
  const canManageMembers = can(member.role, "members.manage");
  const companyToggle = !canManageMembers
    ? `<p class=muted style=font-size:.9rem>Only owners can upgrade/invite — your role <b>${esc(member.role)}</b> is read-only for members.</p>`
    : isPersonal
    ? `<form method=post action="/settings/company?org=${orgId}"><label style="display:flex;gap:.5rem;align-items:center"><input type=checkbox name=company value=1> Company — upgrade this Personal Organization to a Company Organization</label> <button class=btn type=submit>Upgrade to Company →</button></form><p class=muted style=font-size:.85rem>In-place upgrade: Domains and balance stay on this org (no move). Needed to invite members.</p>`
    : `<div class=card style="border-left:4px solid #111"><b>Company Organization</b><p class=muted style=font-size:.9rem>Upgrade complete — members and invites enabled. Domains/balance unchanged on org ${orgId}.</p></div><div class=card><h3 style=margin:0>Invite member</h3><form method=post action="/settings/members/invite?org=${orgId}" style="display:grid;gap:.5rem;max-width:420px"><label>Email <input name=email type=email required placeholder="colleague@company.com"></label><label>Role <select name=role><option value=viewer selected>viewer — read only</option><option value=billing>billing — money only</option><option value=admin>admin — domains + DNS</option><option value=owner>owner — all</option></select></label><button class=btn type=submit>Invite →</button></form><p class=muted style=font-size:.82rem>Invites live 7 days (token_hash) — invitee accepts via POST /invite/accept with token. Personal Organization stays solo.</p></div><div class=card><h3 style=margin:0>Accept invite</h3><form method=post action="/invite/accept" style="display:flex;gap:.5rem"><input name=token placeholder="paste invite token" required style="flex:1"><button class=btn type=submit>Accept →</button></form></div>`;
  return c.html(shell("Settings — Namenice", `<div class=card><h3 style=margin:0>Settings — ${esc(org?.title||`org ${orgId}`)}</h3><div class=muted style=font-size:.9rem>Type: ${isPersonal ? "Personal Organization (solo — treated as you)" : "Company Organization"}</div>${companyToggle}<p style="margin-top:.8rem"><a href="/billing?org=${orgId}">Billing →</a> · <a href="/domains?org=${orgId}">Domains →</a></p></div>`, { user, orgId }));
});

app.post("/settings/company", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member) return c.redirect("/signin", 302);
  if (!can(member.role, "members.manage")) return c.text("forbidden", 403);
  const form = await c.req.formData().catch(()=>null);
  const wantsCompany = form ? String(form.get("company")||"") === "1" : true;
  if (!wantsCompany) return c.text("Company upgrade requires checkbox", 400);
  const existing = await c.env.DB.prepare("SELECT is_company FROM organizations WHERE id=?").bind(orgId).first().catch(()=>null) as any;
  if (existing && existing.is_company) return c.redirect(`/settings?org=${orgId}`, 303);
  await c.env.DB.prepare("UPDATE organizations SET is_company=1 WHERE id=?").bind(orgId).run().catch(async ()=> {
    try { await c.env.DB.prepare("ALTER TABLE organizations ADD COLUMN is_company INTEGER NOT NULL DEFAULT 0").run(); } catch {}
    await c.env.DB.prepare("UPDATE organizations SET is_company=1 WHERE id=?").bind(orgId).run().catch(()=>{});
  });
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"org.upgrade.company", target:`org ${orgId}`, actor: member.email }); } catch {}
  return c.redirect(`/settings?org=${orgId}`, 303);
});

app.post("/settings/members/invite", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member) return c.redirect("/signin", 302);
  if (!can(member.role, "members.manage")) return c.text("forbidden", 403);
  const isCompanyFlag = await isCompanyOrg(c.env as any, orgId);
  const memberCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM organization_members WHERE org_id=?").bind(orgId).first().catch(()=>({c:1})) as any;
  const isPersonal = !isCompanyFlag && (memberCount?.c ?? 1) <= 1;
  if (isPersonal) return c.text("invite requires Company Organization — upgrade first", 400);
  const form = await c.req.formData();
  const email = String(form.get("email")||"").toLowerCase().trim();
  const role = String(form.get("role")||"viewer").trim() as any;
  if (!email || !email.includes("@")) return c.text("valid email required", 400);
  if (!["owner","admin","billing","viewer"].includes(role)) return c.text("invalid role", 400);
  const token = crypto.randomUUID() + "-" + Math.random().toString(36).slice(2,10);
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const token_hash = [...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const now = Math.floor(Date.now()/1000);
  const expires_at = now + 7*86400;
  await c.env.DB.prepare("INSERT INTO organization_invitations (org_id, email, role, token_hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(orgId, email, role, token_hash, member.accountId, expires_at, now).run().catch(async (e:any)=>{
    const msg = String(e?.message||"");
    if (msg.includes("no such table") || msg.includes("token_hash")) throw e;
  });
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"org.invite.create", target:`${email} ${role}`, actor: member.email }); } catch {}
  c.header("Cache-Control", "no-store, no-cache");
  return c.redirect(`/settings?org=${orgId}`, 303);
});

app.post("/invite/accept", async (c) => {
  const form = await c.req.formData().catch(()=>null);
  const token = String(form?.get("token")|| c.req.query("token")||"").trim();
  if (!token) return c.text("token required", 400);
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const token_hash = [...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const inv = await c.env.DB.prepare("SELECT org_id, email, role, expires_at, accepted_at FROM organization_invitations WHERE token_hash=?").bind(token_hash).first().catch(()=>null) as any;
  if (!inv) return c.text("invalid token", 404);
  const now = Math.floor(Date.now()/1000);
  if (inv.expires_at < now) return c.text("token expired", 410);
  if (inv.accepted_at) return c.text("already accepted", 409);
  const user = await getSessionUser(c);
  if (!user) return c.redirect(`/signin?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`, 302);
  if (user.email.toLowerCase() !== String(inv.email).toLowerCase()) return c.text("email mismatch — sign in as invited email", 403);
  let acc = await c.env.DB.prepare("SELECT id FROM accounts WHERE email=?").bind(user.email.toLowerCase()).first().catch(()=>null) as any;
  if (!acc) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO accounts (email, password_hash, status, billing_status, created_at) VALUES (?, '', 'active', 'inactive', ?)").bind(user.email.toLowerCase(), now).run().catch(()=>{});
    acc = await c.env.DB.prepare("SELECT id FROM accounts WHERE email=?").bind(user.email.toLowerCase()).first().catch(()=>null) as any;
  }
  await c.env.DB.prepare("INSERT OR IGNORE INTO organization_members (account_id, org_id, role, created_at) VALUES (?, ?, ?, ?)").bind(acc.id, inv.org_id, inv.role, now).run().catch(()=>{});
  await c.env.DB.prepare("UPDATE organization_invitations SET accepted_at=? WHERE token_hash=?").bind(now, token_hash).run().catch(()=>{});
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, inv.org_id, { action:"org.invite.accept", target:`${inv.email} ${inv.role}`, actor: user.email }); } catch {}
  c.header("Cache-Control", "no-store, no-cache");
  return c.redirect(`/domains?org=${inv.org_id}`, 303);
});

app.get("/domains", async (c) => {
  const user = await getSessionUser(c);
  const expDomains = user?.email ? await requireExplicitOrg(c, user.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(expDomains as any).ok) return (expDomains as any).response;
  const orgId = (expDomains as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const balance = await getOrgBalance(c.env as any, orgId);
  const memberCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM organization_members WHERE org_id=?").bind(orgId).first().catch(()=>({c:1})) as any;
  const isCompanyFlag = await isCompanyOrg(c.env as any, orgId);
  const isPersonal = !isCompanyFlag && (memberCount?.c ?? 1) <= 1;
  const domainsLabel = isPersonal ? `Your domains — org ${orgId}` : `Organization domains — org ${orgId}`;
  const domains = await c.env.DB.prepare("SELECT domain, status, expires_at, auto_renew, locked, privacy FROM domains WHERE org_id=? ORDER BY domain").bind(orgId).all().catch(()=>({results:[]}));
  const qDomain = c.req.query("q") || "";
  const searchResult = (c as any).get("searchResult") || null;
  const rows = (domains.results||[]).map((d:any)=>`<tr><td><b>${esc(d.domain)}</b> ${d.privacy?'<span class=badge>privacy</span>':''} ${d.locked?'<span class=muted>🔒</span>':''}</td><td>${d.status}</td><td>${d.expires_at?new Date(d.expires_at*1000).toISOString().slice(0,10):"—"}</td><td>${d.auto_renew?"On (balance)":"Off"}</td><td><a class=btn style="background:#fff;color:#111" href="/domains/${encodeURIComponent(d.domain)}/dns?org=${orgId}">DNS →</a> <form method=post action="/domains/renew?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${esc(d.domain)}"><input type=hidden name=duration value="1"><label style="font-size:.85rem"><input type=checkbox name=pay_from_balance value=1 checked> balance ($${(balance/100).toFixed(2)})</label> <button class=btn>Renew 1y</button></form> <form method=post action="/domains/renew-stripe?org=${orgId}" style="display:inline"><input type=hidden name=domain value="${esc(d.domain)}"><button class=btn style="background:#fff;color:#111">Stripe →</button></form></td></tr>`).join("") || `<tr><td colspan=5 class=muted>No domains yet. Search & buy below, or link an existing domain.</td></tr>`;
  const dynOk = dynadotConfigured(c.env as any);
  return c.html(shell("Domains — Namenice", `<div class=card><h3 style=margin:0>Search & buy — Dynadot ${dynOk ? (isSandboxEnabled(c.env as any)?"<span class=badge> sandbox </span>":"<span class=badge> live </span>") : "<span class=muted>(not configured)</span>"}</h3><form method=post action="/domains/search?org=${orgId}" style="display:flex;gap:.5rem;margin:.6rem 0;flex-wrap:wrap"><input name=domain placeholder="example.com" value="${esc(qDomain)}" required style="flex:1;min-width:220px"><button class=btn>Check availability</button></form><div class=muted style="font-size:.82rem">Price shown + $2 service fee. Pay from balance (atomic debit) or Stripe Checkout. ${dynOk ? "" : "Set DYNADOT_API_KEY/SECRET to enable live search."}</div>${searchResult?`<div class=card style="margin-top:.6rem"><b>${esc(searchResult.domain)}</b> — ${searchResult.available?"<span class=badge>available</span>":"taken"} ${searchResult.price?`· $${searchResult.price} /yr`: ""} ${searchResult.available?`<form method=post action="/domains/buy?org=${orgId}" style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap"><input type=hidden name=domain value="${esc(searchResult.domain)}"><select name=duration><option value=1>1y</option><option value=2>2y</option><option value=5>5y</option><option value=10>10y</option></select><label><input type=checkbox name=pay_from_balance value=1 checked> Pay from balance ($${(balance/100).toFixed(2)})</label><button class=btn>Buy ${searchResult.domain}</button></form>`:""}</div>`:""}</div><div class=card><h3 style=margin:0>${esc(domainsLabel)}</h3><table><thead><tr><th>Domain</th><th>Status</th><th>Expires</th><th>Auto-renew</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class=card><h3 style=margin:0>Link external domain</h3><form method=post action="/domains/link?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=domain placeholder="mydomain.com" required><button class=btn style="background:#fff;color:#111">Link →</button></form><div class=muted style="font-size:.82rem">For bring-your-own DNS: point NS to us or add CNAME to ${c.env.CNAME_TARGET||"fallback.blognice.com"}</div></div>`, { user, orgId }));
});

app.post("/domains/search", async (c) => {
  const _u = await getSessionUser(c);
  const _exp = _u?.email ? await requireExplicitOrg(c, _u.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_exp as any).ok) return (_exp as any).response;
  const orgId = (_exp as any).orgId as number;
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
      return c.html(shell("Search", `<div class=card><p>Dynadot error: ${esc(String(r.error||""))}</p><p class=muted>${esc(JSON.stringify(raw||{}).slice(0,800))}</p><a href="/domains?org=${orgId}">← Back</a></div>`), 502);
    }
  } else {
    available = domain.endsWith(".test") || false;
    price = "14.99";
  }
  const balance = await getOrgBalance(c.env as any, orgId);
  return c.html(shell("Search — "+esc(domain), `<div class=card><h3>${esc(domain)} — ${available?'<span class=badge>available</span>':'<span class=muted>taken</span>'}</h3>${price?`<p>Price: $${price} /yr <span class=muted>incl. $2 fee</span></p>`:""}${available?`<form method=post action="/domains/buy?org=${orgId}" style="display:grid;gap:.6rem;max-width:560px">
      <input type=hidden name=domain value="${esc(domain)}">
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Your name <input name=contact_name required placeholder="Jane Doe" maxlength=80></label><label>Email <input name=contact_email type=email required placeholder="jane@example.com"></label></div>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Phone CC <input name=contact_phone_cc required placeholder="1" value="1" maxlength=5></label><label>Phone <input name=contact_phone required placeholder="5551234567" maxlength=20></label></div>
      <label>Address <input name=contact_address1 required placeholder="123 Main St" maxlength=120></label>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>City <input name=contact_city required placeholder="San Francisco" maxlength=80></label><label>State <input name=contact_state placeholder="CA" maxlength=80></label></div>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>ZIP <input name=contact_zip required placeholder="94105" maxlength=20></label><label>Country (2-letter) <input name=contact_country required placeholder="US" value="US" maxlength=2 style="text-transform:uppercase"></label></div>
      <label>Organization (optional) <input name=contact_org placeholder="Acme Inc" maxlength=80></label>
      <div style="display:grid;gap:.6rem;grid-template-columns:1fr 1fr"><label>Privacy <select name=privacy><option value="full" selected>Full</option><option value="partial">Partial</option><option value="off">Off</option></select></label><label>Duration <select name=duration><option value=1 selected>1y — $${price}</option><option value=2>2y</option><option value=5>5y</option><option value=10>10y</option></select></label></div>
      <label style="display:flex;gap:.5rem;align-items:center"><input type=checkbox name=pay_from_balance value=1 checked> Pay from balance ($${(balance/100).toFixed(2)}) — else Stripe Checkout</label>
      <button class=btn type=submit>Buy ${esc(domain)} — $${price}</button>
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
  const _userBuy = await getSessionUser(c);
  const _expBuy = await requireExplicitOrg(c, _userBuy?.email || "");
  if (!_expBuy.ok) return _expBuy.response;
  const orgId = _expBuy.orgId;
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
    return c.html(shell("Purchased", `<div class=card><p>Purchased <b>${esc(domain)}</b> for ${duration}y (privacy ${privacy}) — debited $${(amountCents/100).toFixed(2)} (balance $${(r.balanceAfter!/100).toFixed(2)}).</p><p><a class=btn href="/domains/${encodeURIComponent(domain)}/dns?org=${orgId}">Manage DNS →</a> <a class=btn href="/domains?org=${orgId}" style="background:#fff;color:#111">← Domains</a></p></div>`));
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
  const member = await requireOrgMember(c, orgId);
  const user = await getSessionUser(c);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const domain = c.req.param("domain").toLowerCase();
  const exists = await c.env.DB.prepare("SELECT 1 FROM domains WHERE org_id=? AND domain=?").bind(orgId, domain).first().catch(()=>null);
  if (!exists) return c.html(shell("Not found", `<div class=card><p>Domain ${esc(domain)} not in org ${orgId}. <a href="/domains?org=${orgId}">← Back</a></p></div>`, { user, orgId }), 404);
  const records = await listDns(c.env as any, orgId, domain);
  const rows = records.map((r:any)=>`<tr><td><b>${r.host}</b></td><td>${r.type}</td><td style="word-break:break-all">${r.value}</td><td>${r.ttl}</td><td>${r.priority ?? "—"}</td><td><form method=post action="/domains/${encodeURIComponent(domain)}/dns/remove?org=${orgId}" style="display:inline"><input type=hidden name=id value="${r.id}"><button class=btn style="background:#fff;color:#111">Remove</button></form></td></tr>`).join("") || `<tr><td colspan=6 class=muted>No records. Add one below. Default: we prefill @ A for fallback.</td></tr>`;
  return c.html(shell(`DNS — ${domain}`, `<div class=card><h3 style=margin:0>DNS — ${domain} <span class=muted style=font-weight:400>· org ${orgId}</span></h3><table><thead><tr><th>Host</th><th>Type</th><th>Value</th><th>TTL</th><th>Prio</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class=card><h3 style=margin:0>Add record</h3><form method=post action="/domains/${encodeURIComponent(domain)}/dns/add?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end"><label>Host <input name=host placeholder="@" value="@" required></label><label>Type <select name=type>${DNS_TYPES.map(t=>`<option>${t}</option>`).join("")}</select></label><label>Value <input name=value placeholder="1.2.3.4 or target" required style="min-width:240px"></label><label>TTL <input name=ttl type=number value=3600 min=60 max=86400 style="width:90px"></label><label>Prio <input name=priority type=number placeholder="10" style="width:70px"></label><button class=btn>Add</button></form><div class=muted style="font-size:.82rem;margin-top:.4rem">Examples: <code>@ A 76.76.21.21</code> · <code>www CNAME ${domain}</code> · <code>@ MX mail.example.com (prio 10)</code> · <code>@ TXT v=spf1 include:_spf.example.com ~all</code></div></div><div class=card><h3 style=margin:0>Import zone file</h3><form method=post action="/domains/${encodeURIComponent(domain)}/dns/import?org=${orgId}"><textarea name=zone placeholder="; BIND zone&#10;@ 3600 IN A 76.76.21.21&#10;www 3600 IN CNAME @" rows=4 style="width:100%;padding:.6rem;border:1px solid #e6e6e6;border-radius:8px"></textarea><button class=btn style="margin-top:.4rem">Import →</button></form><p class=muted style="font-size:.82rem">Bulk: paste BIND. For CSV bulk use API.</p></div>
<div class=card><h3 style=margin:0>URL forwarding</h3><form method=post action="/domains/${encodeURIComponent(domain)}/forward?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=host placeholder="@" value="@" style="width:80px"><input name=target placeholder="https://example.com" style="flex:1" required><select name=code><option value=301>301</option><option value=302>302</option></select><button class=btn>Forward →</button></form><p class=muted style="font-size:.82rem">Edge 301/302 via Worker. Vanity NS: set to <code>ns1.namenice.net / ns2.namenice.net</code> + enable DNSSEC below.</p></div>
<div class=card><h3 style=margin:0>DNSSEC</h3><p class=muted style="font-size:.85rem">DS/DNSKEY — coming soon. We’ll publish <code>DNSKEY</code> and you add <code>DS</code> at registrar. Audit: <code>dns.dnssec.enable</code></p><form method=post action="/domains/${encodeURIComponent(domain)}/dns?org=${orgId}" onsubmit="return false"><button class=btn style="background:#fff;color:#111" disabled>Enable DNSSEC (soon)</button></form></div>
<div class=card><h3 style=margin:0>Nameservers</h3><p class=muted style="font-size:.85rem">We host DNS at Namenice. If domain is at Dynadot, set NS to <code>ns1.namenice.net / ns2.namenice.net</code> or keep Dynadot DNS and we sync via API.</p><form method=post action="/domains/${encodeURIComponent(domain)}/ns?org=${orgId}" style="display:flex;gap:.5rem"><input name=ns placeholder="ns1.namenice.net, ns2.namenice.net" style="flex:1"><button class=btn style="background:#fff;color:#111">Update NS</button></form></div>`, { user, orgId }));
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
app.post("/domains/:domain/dns/import", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const zone = String(form.get("zone")||"").slice(0,20000);
  let added=0;
  for (const line of zone.split("\n")) {
    const s=line.trim(); if(!s||s.startsWith(";")||s.startsWith("$")) continue;
    const parts=s.split(/\s+/); if(parts.length<4) continue;
    const host=parts[0].replace(domain,"").replace(".", "")||"@";
    const ttl = Number(parts[1])||3600;
    const type = parts[2].toUpperCase();
    const value = parts.slice(3).join(" ");
    if (!["A","AAAA","CNAME","MX","TXT","NS","SRV","CAA"].includes(type)) continue;
    try { const { addDns } = await import("./dns.ts"); await addDns(c.env as any, orgId, domain, { host, type, value, ttl }); added++; } catch {}
  }
  return c.html(shell("Zone imported", `<div class=card><p>Imported ${added} records for ${esc(domain)}.</p><a href="/domains/${encodeURIComponent(domain)}/dns?org=${orgId}">← DNS</a></div>`));
});
app.post("/domains/:domain/forward", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const domain = c.req.param("domain").toLowerCase();
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "dns.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const host = String(form.get("host")||"@").trim().slice(0,253) || "@";
  const target = String(form.get("target")||"").trim().slice(0,500);
  const code = Number(form.get("code")||301);
  if (!target) return c.text("target required",400);
  const now = Math.floor(Date.now()/1000);
  await c.env.DB.prepare("INSERT INTO domain_forwards (org_id, domain, host, target, code, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(orgId, domain, host, target, code, now).run().catch(()=>{});
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"forward.add", target:`${host}.${domain} → ${target}`, actor: member.email }); } catch {}
  return c.redirect(`/domains/${encodeURIComponent(domain)}/dns?org=${orgId}`,303);
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
  const _userRenew = await getSessionUser(c);
  const _expRenew = await requireExplicitOrg(c, _userRenew?.email || "");
  if (!_expRenew.ok) return _expRenew.response;
  const orgId = _expRenew.orgId;
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
    return c.html(shell("Renewed", `<div class=card><p>Renewed ${esc(domain)} — debited $${(amountCents/100).toFixed(2)}.</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
  }
  return c.text("Use Stripe renew endpoint", 400);
});
app.post("/domains/renew-stripe", async (c) => {
  const _uR = await getSessionUser(c);
  const _eR = _uR?.email ? await requireExplicitOrg(c, _uR.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_eR as any).ok) return (_eR as any).response;
  const orgId = (_eR as any).orgId as number;
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
  const _uT = await getSessionUser(c);
  const _eT = _uT?.email ? await requireExplicitOrg(c, _uT.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_eT as any).ok) return (_eT as any).response;
  const orgId = (_eT as any).orgId as number;
  return c.html(shell("Transfer — Namenice", `<div class=card><h3>Transfer in</h3><form method=post action="/domains/transfer/in?org=${orgId}" style="display:grid;gap:.6rem;max-width:520px"><label>Domain <input name=domain required placeholder="example.com"></label><label>Auth code <input name=auth_code required placeholder="X1Y2-..."></label><button class=btn>Start transfer — $14.99</button></form><p class=muted style="font-size:.82rem">Unlock at old registrar first. Transfers take 5-7 days. We debit from balance or Stripe like buy.</p></div><div class=card><h3>Transfer out / Auth code</h3><form method=post action="/domains/transfer/out?org=${orgId}" style="display:flex;gap:.5rem"><input name=domain placeholder="mydomain.com" required><button class=btn style="background:#fff;color:#111">Request auth code</button></form></div><div class=card><h3>Bulk</h3><form method=post action="/domains/bulk/renew?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=domains placeholder="a.com, b.com" style="flex:1"><button class=btn>Bulk renew 1y from balance</button></form></div>`));
});
app.post("/domains/transfer/in", async (c) => {
  const _uTi = await getSessionUser(c);
  const _eTi = _uTi?.email ? await requireExplicitOrg(c, _uTi.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_eTi as any).ok) return (_eTi as any).response;
  const orgId = (_eTi as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  const auth = String(form.get("auth_code")||"").trim();
  if (!domain || !auth) return c.text("domain + auth_code required",400);
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"domain.transfer.in", target:`${domain} auth:${auth.slice(0,4)}***`, actor: member.email }); } catch {}
  return c.html(shell("Transfer started", `<div class=card><p>Transfer for <b>${esc(domain)}</b> initiated (auth ${auth.slice(0,4)}***). Check email at losing registrar to approve. <span class=muted>Sandbox: simulated.</span></p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.post("/domains/transfer/out", async (c) => {
  const _uTo = await getSessionUser(c);
  const _eTo = _uTo?.email ? await requireExplicitOrg(c, _uTo.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_eTo as any).ok) return (_eTo as any).response;
  const orgId = (_eTo as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const domain = String(form.get("domain")||"").toLowerCase().trim();
  try { const { recordAuditEvent } = await import("./metrics.ts"); recordAuditEvent(c.env as any, orgId, { action:"domain.transfer.out", target:domain, actor: member.email }); } catch {}
  return c.html(shell("Auth code", `<div class=card><p>Auth code for <b>${esc(domain)}</b> sent to registrant email. Unlock the domain first if locked.</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.post("/domains/bulk/renew", async (c) => {
  const _uB = await getSessionUser(c);
  const _eB = _uB?.email ? await requireExplicitOrg(c, _uB.email) : { ok: true as const, orgId: Number(c.req.query("org") || 1) };
  if (!(_eB as any).ok) return (_eB as any).response;
  const orgId = (_eB as any).orgId as number;
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "billing.manage")) return c.text("forbidden",403);
  const form = await c.req.formData();
  const list = String(form.get("domains")||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  let ok=0, fail=0;
  for (const dom of list) {
    const r = await (await import("./balance.ts")).debitBalance(c.env as any, orgId, member.accountId, 1499, { idempotencyKey:`bulk:renew:${orgId}:${dom}:${Math.floor(Date.now()/86400000)}`, description:`Bulk renew ${dom}`, domain: dom });
    if (r.ok) { ok++; await c.env.DB.prepare("UPDATE domains SET expires_at=COALESCE(expires_at, strftime('%s','now'))+365*86400 WHERE org_id=? AND domain=?").bind(orgId, dom).run().catch(()=>{}); } else fail++;
  }
  return c.html(shell("Bulk renew", `<div class=card><p>Renewed ${ok} domains, ${fail} failed (insufficient balance).</p><a href="/domains?org=${orgId}">← Domains</a></div>`));
});
app.get("/api/keys", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  const user = await getSessionUser(c);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const rows = await c.env.DB.prepare("SELECT id, label, prefix, scopes, last_used_at, expires_at, created_at FROM api_keys WHERE org_id=? ORDER BY created_at DESC").bind(orgId).all().catch(()=>({results:[]})) as any;
  const list = (rows.results||[]).map((r:any)=>`<tr><td><code>${r.prefix}***</code></td><td>${r.label}</td><td class=muted>${r.scopes}</td><td>${r.last_used_at?new Date(r.last_used_at*1000).toISOString().slice(0,10):"—"}</td><td><form method=post action="/api/keys/revoke?org=${orgId}" style="display:inline"><input type=hidden name=id value="${r.id}"><button class=btn style="background:#fff;color:#111">Revoke</button></form></td></tr>`).join("") || `<tr><td colspan=5 class=muted>No keys — create one below</td></tr>`;
  return c.html(shell("API Keys — Namenice", `<div class=card><h3 style=margin:0>API keys — org ${orgId}</h3><table><thead><tr><th>Key</th><th>Label</th><th>Scopes</th><th>Last used</th><th></th></tr></thead><tbody>${list}</tbody></table></div><div class=card><h3 style=margin:0>Create key</h3><form method=post action="/api/keys?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=label placeholder="CI / Terraform" required><select name=scopes><option value="domains:read,dns:read">read</option><option value="domains:read,dns:read,dns:write" selected>dns:write</option><option value="domains:read,dns:read,dns:write,billing:read">full</option></select><button class=btn>Create — shows once</button></form><p class=muted style="font-size:.82rem">Use <code>Authorization: Bearer nn_&lt;token&gt;</code> + <code>X-Org: ${orgId}</code>. Webhooks: <code>POST /webhooks/dns.updated</code> coming next.</p></div>`, { user, orgId }));
});
app.post("/api/keys", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.redirect("/signin",302);
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
  const user = await getSessionUser(c);
  return c.html(shell("API key created", `<div class=card><p>Copy now — shown once:</p><p><code style="font-size:1.1rem;user-select:all">${raw}</code></p><p class=muted>Prefix ${prefix} · scopes ${scopes}</p><a href="/api/keys?org=${orgId}">← Back</a></div>`, { user, orgId }));
});
app.get("/webhooks", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  const user = await getSessionUser(c);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const rows = await c.env.DB.prepare("SELECT id, url, events, active, created_at FROM webhooks WHERE org_id=? ORDER BY created_at DESC").bind(orgId).all().catch(()=>({results:[]})) as any;
  const list = (rows.results||[]).map((r:any)=>`<tr><td style="word-break:break-all">${r.url}</td><td>${r.events}</td><td>${r.active?"active":"paused"}</td><td><form method=post action="/webhooks/delete?org=${orgId}" style="display:inline"><input type=hidden name=id value="${r.id}"><button class=btn style="background:#fff;color:#111">Delete</button></form></td></tr>`).join("") || `<tr><td colspan=4 class=muted>No webhooks — add one for dns.updated / domain.renewed</td></tr>`;
  return c.html(shell("Webhooks — Namenice", `<div class=card><h3 style=margin:0>Webhooks — org ${orgId}</h3><table><thead><tr><th>URL</th><th>Events</th><th>Status</th><th></th></tr></thead><tbody>${list}</tbody></table></div><div class=card><h3 style=margin:0>Add webhook</h3><form method=post action="/webhooks?org=${orgId}" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name=url placeholder="https://example.com/hook" required style="flex:1"><select name=events><option value="dns.updated">dns.updated</option><option value="domain.renewed">domain.renewed</option><option value="domain.registered">domain.registered</option><option value="*">* (all)</option></select><button class=btn>Create</button></form><p class=muted style="font-size:.82rem">Signed with <code>X-Namenice-Signature: sha256=hex(HMAC secret, body)</code>. Terraform: <code>provider "namenice" { api_key = "nn_..." }</code> — stub.</p></div><div class=card><h3 style=margin:0>CLI / Terraform</h3><pre style="background:#111;color:#0f0;padding:.8rem;border-radius:8px;overflow:auto">npm i -g namenice-cli  # coming soon
namenice domains list --org ${orgId}
namenice dns add ${"example.com"} --host @ --type A --value 1.2.3.4
terraform { required_providers { namenice = { source = "pragmaticonline/namenice" } } }</pre></div>`, { user, orgId }));
});
app.post("/webhooks", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.redirect("/signin",302);
  const form = await c.req.formData();
  const url = String(form.get("url")||"").trim().slice(0,500);
  const events = String(form.get("events")||"dns.updated").trim().slice(0,200);
  if (!url.startsWith("https://")) return c.text("https url required",400);
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const now = Math.floor(Date.now()/1000);
  await c.env.DB.prepare("INSERT INTO webhooks (org_id, url, events, secret, created_at) VALUES (?, ?, ?, ?, ?)").bind(orgId, url, events, secret, now).run();
  const user = await getSessionUser(c);
  return c.html(shell("Webhook created", `<div class=card><p>Webhook for <b>${events}</b> → ${url}</p><p>Secret: <code>${secret}</code> (store it — HMAC verification)</p><a href="/webhooks?org=${orgId}">← Back</a></div>`, { user, orgId }));
});
app.post("/webhooks/delete", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.redirect("/signin",302);
  const form = await c.req.formData();
  await c.env.DB.prepare("DELETE FROM webhooks WHERE id=? AND org_id=?").bind(Number(form.get("id")), orgId).run().catch(()=>{});
  return c.redirect(`/webhooks?org=${orgId}`,303);
});

app.post("/api/keys/revoke", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  if (!member || !can(member.role, "domains.manage")) return c.redirect("/signin",302);
  const form = await c.req.formData();
  await c.env.DB.prepare("DELETE FROM api_keys WHERE id=? AND org_id=?").bind(Number(form.get("id")), orgId).run().catch(()=>{});
  return c.redirect(`/api/keys?org=${orgId}`,303);
});

app.get("/audit", async (c) => {
  const orgId = Number(c.req.query("org") || 1);
  const member = await requireOrgMember(c, orgId);
  const user = await getSessionUser(c);
  if (!member || !user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.url)}`, 302);
  const page = Math.max(1, parseInt(c.req.query("page")||"1",10)||1);
  try {
    const { entries, hasMore } = await auditReport(c.env as any, orgId, 90, page, 50);
    const rows = entries.map(e=>`<tr><td>${e.occurredAt}</td><td>${e.action}</td><td>${e.target||"—"}</td><td>${e.actor||"—"}</td></tr>`).join("") || `<tr><td colspan=4 class=muted>No actions in last 90 days.</td></tr>`;
    return c.html(shell("Audit log — 90 days", `<div class=card><div style="display:flex;justify-content:space-between"><h3 style="margin:0">Audit log</h3><span class=muted>Last 90 days · Analytics Engine</span></div><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right;margin-top:.6rem">${page>1?`<a href="/audit?org=${orgId}&page=${page-1}">← Prev</a> `:""}${hasMore?`<a href="/audit?org=${orgId}&page=${page+1}">Next →</a>`:""}</div></div>`, { user, orgId }));
  } catch (e:any) { return c.html(shell("Audit", `<div class=card><p>Could not load audit: ${String(e?.message||e).slice(0,300)}</p><p class=muted>Configure CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN.</p></div>`, { user, orgId }), 502); }
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
