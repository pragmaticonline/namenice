// Port of blognice src/metrics.ts — same 90-day Analytics Engine audit
export const METRICS_DATASET = "namenice_pageviews";
export const EVENTS_DATASET = "namenice_events";
export type MetricsEnv = { DB?: D1Database; METRICS: AnalyticsEngineDataset; EVENTS: AnalyticsEngineDataset; CF_ACCOUNT_ID?: string; CF_ANALYTICS_TOKEN?: string; };
export type AuditEntry = { occurredAt: string; action: string; target: string; actor: string; events: number };
function sqlString(v:string){return `'${v.replaceAll("'","''")}'`;}
function numberValue(v:unknown){const n=typeof v==="number"?v:Number(v);return Number.isFinite(n)?n:0;}
function analyticsConfig(env:MetricsEnv){const a=env.CF_ACCOUNT_ID?.trim(), t=env.CF_ANALYTICS_TOKEN?.trim();return a&&t?{accountId:a,token:t}:null;}
export function metricsConfigured(env:MetricsEnv){return !!analyticsConfig(env);}
export async function analyticsSql(env:MetricsEnv, query:string){
  const cfg=analyticsConfig(env)!;
  const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/analytics_engine/sql`,{method:"POST",headers:{authorization:`Bearer ${cfg.token}`,"content-type":"text/plain"},body:query});
  const text=await res.text(); let j:any={}; try{j=JSON.parse(text)}catch{}
  if(!res.ok){ if(/unknown table|does not exist|not found/i.test(JSON.stringify(j.errors??j))) return []; throw new Error(`AE ${res.status}: ${JSON.stringify(j.errors??j).slice(0,600)}`)}
  return (j.data??[]) as Record<string,unknown>[];
}
export async function auditReport(env:MetricsEnv, orgId:number, days=90, page=1, limit=50){
  const interval=Math.max(1,Math.min(90,Math.trunc(days))); const safePage=Number.isSafeInteger(page)&&page>=1?page:1; const safeLimit=Math.max(1,Math.min(100,limit||50)); const offset=(safePage-1)*safeLimit;
  const rows=await analyticsSql(env, `SELECT formatDateTime(timestamp, '%Y-%m-%d %H:%i:%S') AS occurred_at, blob1 AS action, blob2 AS target, blob3 AS actor, SUM(_sample_interval) AS events FROM ${EVENTS_DATASET} WHERE index1=${sqlString(String(orgId))} AND timestamp >= NOW() - INTERVAL '${interval}' DAY AND blob1 LIKE 'audit:%' GROUP BY occurred_at,action,target,actor ORDER BY occurred_at DESC LIMIT ${safeLimit+1} OFFSET ${offset}`);
  const hasMore=rows.length>safeLimit; const slice=hasMore?rows.slice(0,safeLimit):rows;
  return {entries: slice.map(r=>({occurredAt:String(r.occurred_at??""),action:String(r.action??"").replace(/^audit:/,""),target:String(r.target??""),actor:String(r.actor??""),events:numberValue(r.events)})), hasMore};
}
export function recordAuditEvent(env:MetricsEnv, orgId:number, e:{action:string;target:string;actor:string}){
  env.EVENTS.writeDataPoint({indexes:[String(orgId)], blobs:[`audit:${e.action}`, e.target.slice(0,160), e.actor.slice(0,80), "","",""], doubles:[1]});
}
