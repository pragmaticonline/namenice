import type { BalanceEnv } from "./balance.ts";
export type StripeEnv = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_PRICE_ID?: string; STRIPE_MONTHLY_PRICE_ID?: string; STRIPE_YEARLY_PRICE_ID?: string; };
export function stripeConfigured(env: StripeEnv){ return !!env.STRIPE_SECRET_KEY; }
async function stripeRequest<T>(env: StripeEnv, path: string, params: URLSearchParams): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method:"POST", headers:{ Authorization:`Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`, "content-type":"application/x-www-form-urlencoded"}, body: params });
  const j = await r.json().catch(()=>({})) as any; if(!r.ok) throw new Error(j.error?.message||`Stripe ${r.status}`); return j as T;
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
export function createPortalSession(env: StripeEnv, customerId: string, returnUrl: string){
  const p = new URLSearchParams({ customer: customerId, return_url: returnUrl });
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) p.set("configuration", env.STRIPE_PORTAL_CONFIGURATION_ID);
  return stripeRequest<{id:string;url:string}>(env,"billing_portal/sessions",p);
}
export async function verifyStripeSignature(raw:string, sig:string|undefined, secret:string|undefined): Promise<boolean> {
  if(!sig||!secret) return false;
  const parts = Object.fromEntries(sig.split(",").map(s=>{const [k,v]=s.split("=");return [k,v]}));
  const ts = parts.t; const v1 = parts.v1; if(!ts||!v1) return false;
  const payload = `${ts}.${raw}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,"0")).join("");
  return hex===v1;
}
