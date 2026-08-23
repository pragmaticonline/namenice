import { betterAuth } from "better-auth";

export const ROLES = ["owner","admin","billing","viewer"] as const;
export type Role = typeof ROLES[number];

export function can(role:string, cap:string){
  if(role==="owner") return true;
  if(cap==="members.manage") return role==="owner";
  if(cap==="billing.manage") return role==="owner"||role==="billing"||role==="admin";
  if(cap==="dns.manage") return role==="owner"||role==="admin";
  if(cap==="domains.manage") return role==="owner"||role==="admin"||role==="billing";
  if(cap==="domains.read") return true;
  if(cap==="dns.read") return true;
  return false;
}

export function createAuth(env: { BETTER_AUTH_SECRET?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; DB: D1Database }, origin: string) {
  const secret = env.BETTER_AUTH_SECRET || "dev-secret-change-me-32chars-min";
  return betterAuth({
    secret,
    baseURL: origin,
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),
    },
    session: { cookieCache: { enabled: true } },
    advanced: { crossSubDomainCookies: { enabled: true } },
  });
}
