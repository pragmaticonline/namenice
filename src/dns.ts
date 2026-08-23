import type { BalanceEnv } from "./balance.ts";

export const DNS_TYPES = ["A","AAAA","CNAME","MX","TXT","NS","SRV","CAA","ALIAS"] as const;
export type DnsType = typeof DNS_TYPES[number];

export function validateDnsRecord(input: { host: string; type: string; value: string; ttl?: number; priority?: number }): string | null {
  if (!input.host || input.host.length > 253) return "host required ( @ or subdomain, max 253 )";
  if (!DNS_TYPES.includes(input.type as any)) return `type must be one of ${DNS_TYPES.join(", ")}`;
  if (!input.value || input.value.length > 4096) return "value required";
  const ttl = Number(input.ttl ?? 3600);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) return "ttl must be 60–86400";
  if (input.type === "MX" && input.priority !== undefined) {
    const p = Number(input.priority);
    if (!Number.isInteger(p) || p < 0 || p > 65535) return "MX priority 0–65535";
  }
  if (input.value.includes("\n")) return "value cannot contain newline";
  return null;
}

export async function listDns(env: { DB: D1Database }, orgId: number, domain: string) {
  const { results } = await env.DB.prepare("SELECT id, host, type, value, ttl, priority, status, created_at, updated_at FROM dns_records WHERE org_id=? AND domain=? ORDER BY host, type").bind(orgId, domain).all<any>();
  return results || [];
}
export async function addDns(env: { DB: D1Database }, orgId: number, domain: string, r: { host: string; type: string; value: string; ttl?: number; priority?: number | null }): Promise<number> {
  const err = validateDnsRecord({ host: r.host, type: r.type, value: r.value, ttl: r.ttl, priority: r.priority ?? undefined });
  if (err) throw new Error(err);
  const now = Math.floor(Date.now()/1000);
  const res = await env.DB.prepare("INSERT INTO dns_records (org_id, domain, host, type, value, ttl, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)").bind(orgId, domain.toLowerCase(), r.host.trim() || "@", r.type.toUpperCase(), r.value.trim(), Number(r.ttl ?? 3600), r.priority ?? null, now, now).run();
  return res.meta.last_row_id as number;
}
export async function removeDns(env: { DB: D1Database }, orgId: number, domain: string, id: number) {
  const res = await env.DB.prepare("DELETE FROM dns_records WHERE id=? AND org_id=? AND domain=?").bind(id, orgId, domain).run();
  if (res.meta.changes === 0) throw new Error("record not found");
}
export async function updateDns(env: { DB: D1Database }, orgId: number, domain: string, id: number, patch: Partial<{ host:string; type:string; value:string; ttl:number; priority:number }>) {
  const cur = await env.DB.prepare("SELECT * FROM dns_records WHERE id=? AND org_id=? AND domain=?").bind(id, orgId, domain).first<any>();
  if (!cur) throw new Error("record not found");
  const next = { host: patch.host ?? cur.host, type: patch.type ?? cur.type, value: patch.value ?? cur.value, ttl: patch.ttl ?? cur.ttl, priority: patch.priority ?? cur.priority };
  const err = validateDnsRecord(next as any);
  if (err) throw new Error(err);
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE dns_records SET host=?, type=?, value=?, ttl=?, priority=?, updated_at=? WHERE id=?").bind(next.host, next.type.toUpperCase(), next.value, Number(next.ttl), next.priority ?? null, now, id).run();
}
