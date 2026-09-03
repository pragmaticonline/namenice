import type { BalanceEnv } from "./balance.ts";
export type StripeEnv = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_PORTAL_CONFIGURATION_ID?: string; STRIPE_PRICE_ID?: string; STRIPE_MONTHLY_PRICE_ID?: string; STRIPE_YEARLY_PRICE_ID?: string; };
export function stripeConfigured(env: StripeEnv){ return !!env.STRIPE_SECRET_KEY; }
async function stripeRequest<T>(env: StripeEnv, path: string, params: URLSearchParams): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method:"POST", headers:{ Authorization:`Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`, "content-type":"application/x-www-form-urlencoded"}, body: params });
  const j = await r.json().catch(()=>({})) as any; if(!r.ok) throw new Error(j.error?.message||`Stripe ${r.status}`); return j as T;
}
export async function getCheckoutSession(env:StripeEnv, sessionId:string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Checkout Session");
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers:{ Authorization:`Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}` } });
  const j = await r.json().catch(()=>({})) as any;
  if (!r.ok) throw new Error(j.error?.message || `Stripe ${r.status}`);
  return j as { id:string; payment_status:string; metadata?:Record<string,string> };
}
export function createTopupCheckoutSession(env: StripeEnv, input: { orgId:number; accountId:number; email:string; customerId?:string|null; amountCents:number; successUrl:string; cancelUrl:string }){
  // Custom amount top-up — Stripe as primary processor (no stored card, Checkout handles SCA)
  if (input.amountCents < 500) throw new Error("Minimum top-up is $5.00");
  if (input.amountCents > 100000) throw new Error("Maximum single top-up is $1000.00");
  const p = new URLSearchParams();
  p.set("mode","payment");
  p.set("line_items[0][price_data][currency]","usd");
  p.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  p.set("line_items[0][price_data][product_data][name]", "Namenice account balance top-up");
  p.set("line_items[0][price_data][product_data][description]", `Credit $${(input.amountCents/100).toFixed(2)} to organization`);
  p.set("line_items[0][quantity]","1");
  p.set("client_reference_id", String(input.orgId));
  p.set("customer_email", input.email);
  if(input.customerId){ p.delete("customer_email"); p.set("customer", input.customerId); }
  p.set("success_url", input.successUrl);
  p.set("cancel_url", input.cancelUrl);
  p.set("metadata[org_id]", String(input.orgId));
  p.set("metadata[account_id]", String(input.accountId));
  p.set("metadata[type]", "balance_topup");
  p.set("metadata[amount_cents]", String(input.amountCents));
  return stripeRequest<{id:string;url:string}>(env,"checkout/sessions",p);
}
export function createDomainCheckoutWithBalanceFallback(env: StripeEnv, input: { orgId:number; accountId:number; email:string; customerId?:string|null; domain:string; duration:number; amountCents:number; successUrl:string; cancelUrl:string }){
  const p = new URLSearchParams();
  p.set("mode","payment");
  p.set("line_items[0][price_data][currency]","usd");
  p.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  p.set("line_items[0][price_data][product_data][name]", `Domain ${input.domain} — ${input.duration}y`);
  p.set("line_items[0][quantity]","1");
  p.set("client_reference_id", String(input.orgId));
  p.set("customer_email", input.email);
  if(input.customerId){ p.delete("customer_email"); p.set("customer", input.customerId); }
  p.set("success_url", input.successUrl);
  p.set("cancel_url", input.cancelUrl);
  p.set("metadata[org_id]", String(input.orgId));
  p.set("metadata[account_id]", String(input.accountId));
  p.set("metadata[type]", "domain_purchase");
  p.set("metadata[domain]", input.domain);
  p.set("metadata[duration]", String(input.duration));
  return stripeRequest<{id:string;url:string}>(env,"checkout/sessions",p);
}

export function createCartCheckoutSession(env: StripeEnv, input: { orgId:number; accountId:number; email:string; customerId?:string|null; domains:string[]; amountCentsEach?:number; amountCentsByDomain?:Record<string,number>; successUrl:string; cancelUrl:string }) {
  if (input.domains.length < 1 || input.domains.length > 10) throw new Error("Cart must contain 1–10 Domains");
  const domains = input.domains.map((domain) => domain.toLowerCase().trim());
  if (domains.some((domain) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))) throw new Error("Cart contains an invalid Domain");
  const p = new URLSearchParams();
  p.set("mode", "payment");
  domains.forEach((domain, index) => {
    const amount = input.amountCentsByDomain?.[domain] ?? input.amountCentsEach;
    if (!Number.isInteger(amount) || Number(amount) < 1) throw new Error(`Missing authoritative price for ${domain}`);
    p.set(`line_items[${index}][price_data][currency]`, "usd");
    p.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
    p.set(`line_items[${index}][price_data][product_data][name]`, `Domain ${domain} — 1y`);
    p.set(`line_items[${index}][quantity]`, "1");
  });
  p.set("client_reference_id", String(input.orgId));
  p.set("customer_email", input.email);
  if (input.customerId) { p.delete("customer_email"); p.set("customer", input.customerId); }
  p.set("success_url", input.successUrl);
  p.set("cancel_url", input.cancelUrl);
  p.set("metadata[org_id]", String(input.orgId));
  p.set("metadata[account_id]", String(input.accountId));
  p.set("metadata[type]", "domain_cart_purchase");
  p.set("metadata[domains]", domains.join(","));
  return stripeRequest<{id:string;url:string}>(env, "checkout/sessions", p);
}

export function createRenewalCheckoutSession(env:StripeEnv, input:{orgId:number;accountId:number;email:string;customerId?:string|null;domain:string;amountCents:number;successUrl:string;cancelUrl:string}) {
  const p = new URLSearchParams();
  p.set("mode","payment");
  p.set("line_items[0][price_data][currency]","usd");
  p.set("line_items[0][price_data][unit_amount]",String(input.amountCents));
  p.set("line_items[0][price_data][product_data][name]",`Renew Domain ${input.domain} — 1y`);
  p.set("line_items[0][quantity]","1");
  p.set("customer_email",input.email);
  if(input.customerId){p.delete("customer_email");p.set("customer",input.customerId);}
  p.set("success_url",input.successUrl);p.set("cancel_url",input.cancelUrl);
  p.set("metadata[org_id]",String(input.orgId));p.set("metadata[account_id]",String(input.accountId));
  p.set("metadata[type]","domain_renewal");p.set("metadata[domain]",input.domain);
  return stripeRequest<{id:string;url:string}>(env,"checkout/sessions",p);
}
export function createPortalSession(env: StripeEnv, customerId: string, returnUrl: string){
  const p = new URLSearchParams({ customer: customerId, return_url: returnUrl });
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) p.set("configuration", env.STRIPE_PORTAL_CONFIGURATION_ID);
  return stripeRequest<{id:string;url:string}>(env,"billing_portal/sessions",p);
}
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeHexEqual(actual: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(actual) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  const decode = (v: string) => Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(v.slice(i * 2, i * 2 + 2), 16));
  const a = decode(actual); const b = decode(expected);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0;
}
export async function verifyStripeSignature(raw:string, sig:string|undefined, secret:string|undefined): Promise<boolean> {
  if (!sig || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const part of sig.split(",")) {
    const sep = part.indexOf("="); if (sep < 1) continue;
    const k = part.slice(0, sep).trim(); const v = part.slice(sep + 1).trim();
    (parts[k] ||= []).push(v);
  }
  const ts = Number(parts.t?.[0]);
  if (!Number.isFinite(ts) || Math.abs(Date.now()/1000 - ts) > 300 || !parts.v1?.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`)));
  let ok = false; for (const c of parts.v1) ok = constantTimeHexEqual(digest, c) || ok; return ok;
}
