import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const ROLES = ["owner","admin","billing","viewer"] as const;
export type Role = typeof ROLES[number];

export function can(role:string, cap:string){
  if(role==="owner") return true;
  if(cap==="members.manage") return role==="owner";
  if(cap==="billing.manage") return role==="owner";
  if(cap==="dns.manage") return role==="owner"||role==="admin";
  if(cap==="domains.manage") return role==="owner"||role==="admin"||role==="billing";
  if(cap==="domains.read") return true;
  if(cap==="dns.read") return true;
  return false;
}

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
});

const authSchema = { user, session, account, verification };

export function createAuth(env: { BETTER_AUTH_SECRET?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; DB: D1Database }, origin: string) {
  const secret = env.BETTER_AUTH_SECRET || "dev-secret-change-me-32chars-min";
  const db = drizzle(env.DB, { schema: authSchema });
  return betterAuth({
    secret,
    baseURL: origin,
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),
    },
    session: { cookieCache: { enabled: true } },
    advanced: { crossSubDomainCookies: { enabled: true } },
    trustedOrigins: [origin],
  });
}
