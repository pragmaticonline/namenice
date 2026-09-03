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
      const rdap = await fetch(`https://rdap.org/domain/${encodeURIComponent(normalized)}`, { headers:{ accept:"application/rdap+json, application/json" } });
      if (rdap.status === 200) available = false;
      else if (rdap.status !== 404) return { ok:false, error:"Could not independently verify Domain availability" };
    } catch { return { ok:false, error:"Could not independently verify Domain availability" }; }
  }
  return { ok:true, quote:{ domain:normalized, available, premium:available && premium, amountCents:available ? moneyToCents(price) : null } };
}
