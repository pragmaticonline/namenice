export type ApiKeyPrincipal = { keyId: number; orgId: number; scopes: string[] };

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function authenticateApiKey(
  db: D1Database,
  request: Request,
  requiredScope: string,
): Promise<ApiKeyPrincipal | null> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer nn_")) return null;
  const raw = authorization.slice("Bearer ".length);
  const requestedOrg = Number(request.headers.get("x-org"));
  if (!Number.isSafeInteger(requestedOrg) || requestedOrg < 1) return null;

  const row = await db.prepare(
    "SELECT id, org_id, token_hash, scopes, expires_at FROM api_keys WHERE prefix=?",
  ).bind(raw.slice(0, 12)).first<{
    id: number;
    org_id: number;
    token_hash: string;
    scopes: string;
    expires_at: number | null;
  }>();
  if (!row || row.org_id !== requestedOrg || (row.expires_at != null && row.expires_at <= Math.floor(Date.now() / 1000))) return null;

  const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  if (!equalHash(digest, row.token_hash)) return null;
  const scopes = row.scopes.split(",").map((scope) => scope.trim()).filter(Boolean);
  if (!scopes.includes(requiredScope)) return null;

  await db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").bind(Math.floor(Date.now() / 1000), row.id).run();
  return { keyId: row.id, orgId: row.org_id, scopes };
}
