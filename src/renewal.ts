import { dynadotConfigured, renewDomain } from "./dynadot.ts";

type RenewalEnv = { DB:D1Database; DYNADOT_API_KEY?:string; DYNADOT_API_SECRET?:string; DYNADOT_SANDBOX?:string };

export async function renewRegisteredDomain(env:RenewalEnv, orgId:number, domain:string): Promise<{ok:true;expirationYear:number}|{ok:false;error:string}> {
  if (!dynadotConfigured(env)) return {ok:false,error:"Dynadot not configured"};
  const current = await env.DB.prepare("SELECT expires_at FROM domains WHERE org_id=? AND domain=?").bind(orgId, domain).first<{expires_at:number|null}>();
  if (!current) return {ok:false,error:"Domain not found"};
  const expirationYear = new Date(Number(current.expires_at || Math.floor(Date.now()/1000))*1000).getUTCFullYear();
  const result = await renewDomain(env, domain, {duration:1,year:expirationYear});
  if (!result.ok) return {ok:false,error:result.error || "Dynadot renewal failed"};
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE domains SET expires_at=COALESCE(expires_at, ?)+365*86400 WHERE org_id=? AND domain=?").bind(now, orgId, domain).run();
  return {ok:true,expirationYear};
}
