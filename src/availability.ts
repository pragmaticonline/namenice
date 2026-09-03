import { searchDomain, type DynadotResult } from "./dynadot.ts";

type AvailabilityEnv = { DYNADOT_API_KEY?:string; DYNADOT_API_SECRET?:string; DYNADOT_SANDBOX?:string };
export type DomainQuote = { domain:string; available:boolean; premium:boolean; amountCents:number|null };

function flag(value:unknown):boolean {
  if (value === true || value === 1) return true;
  return typeof value === "string" && ["yes", "true", "1"].includes(value.trim().toLowerCase());
}

function moneyToCents(value:unknown):number|null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round((amount + 2) * 100) : null;
}

const COMMON_RDAP_BASES:Record<string,string> = {
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/",
};

let rdapBootstrap:Promise<any>|null = null;

async function rdapBaseFor(domain:string):Promise<string|null> {
  const labels = domain.split(".");
  const tld = labels.at(-1) || "";
  if (COMMON_RDAP_BASES[tld]) return COMMON_RDAP_BASES[tld];
  rdapBootstrap ||= fetch("https://data.iana.org/rdap/dns.json", { headers:{ accept:"application/json" } })
    .then(async response => response.ok ? response.json() : Promise.reject(new Error("RDAP bootstrap unavailable")));
  const bootstrap = await rdapBootstrap;
  for (const service of bootstrap?.services || []) {
    const suffixes:string[] = service?.[0] || [];
    const urls:string[] = service?.[1] || [];
    if (suffixes.some(suffix => suffix.toLowerCase() === tld) && urls[0]) return urls[0];
  }
  return null;
}

async function registryHasDomain(domain:string):Promise<boolean|null> {
  const base = await rdapBaseFor(domain);
  if (!base) return null;
  const response = await fetch(`${base.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`, {
    headers:{ accept:"application/rdap+json, application/json" },
  });
  if (response.status === 404) return false;
  if (response.status !== 200) return null;
  const record:any = await response.json().catch(() => null);
  return record?.objectClassName === "domain" && String(record?.ldhName || "").toLowerCase() === domain;
}

export async function getDomainQuote(env:AvailabilityEnv, domain:string):Promise<{ok:true;quote:DomainQuote}|{ok:false;error:string}> {
  const normalized = domain.toLowerCase().trim();
  const result:DynadotResult<any> = await searchDomain(env, normalized, { show_price:true });
  if (!result.ok || !result.data) return { ok:false, error:result.error || "Registrar search failed" };
  const data = result.data;
  const nested = data?.search_results?.[normalized] || data?.searchResults?.[normalized] || null;
  let available = flag(data?.available) || data?.status === "available" || flag(nested?.available);
  const premium = available && (flag(data?.premium) || flag(nested?.premium));
  const price = data?.price ?? nested?.price ?? data?.priceList?.[0]?.registration_price ?? data?.price_list?.[0]?.registration_price ?? nested?.priceList?.[0]?.registration_price;
  if (available) {
    try {
      const registered = await registryHasDomain(normalized);
      if (registered === true) available = false;
      else if (registered === null) return { ok:false, error:"Could not independently verify Domain availability" };
    } catch { return { ok:false, error:"Could not independently verify Domain availability" }; }
  }
  return { ok:true, quote:{ domain:normalized, available, premium:available && premium, amountCents:available ? moneyToCents(price) : null } };
}
