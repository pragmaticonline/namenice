// Better Auth on Hono + D1 — org scoping mirrors blognice memberships
// TODO: wire better-auth/hono adapter once Better Auth is initialized (see https://www.better-auth.com/docs/integrations/hono)
export function can(role:string, cap:string){
  if(role==="owner") return true;
  if(cap==="members.manage") return role==="owner";
  if(cap==="billing.manage") return role==="owner"||role==="billing"||role==="admin";
  if(cap==="dns.manage") return role==="owner"||role==="admin";
  return true;
}
