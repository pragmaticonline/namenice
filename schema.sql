-- Namenice index DB — clones blognice memberships + invitations + Analytics audit
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  billing_status TEXT NOT NULL DEFAULT 'inactive',
  created_at INTEGER NOT NULL
);
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE organization_members (
  account_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, org_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_org_members_account ON organization_members(account_id);
CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE TABLE organization_invitations (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE domains (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  tld TEXT,
  registrar TEXT NOT NULL DEFAULT 'dynadot',
  expires_at INTEGER,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 1,
  privacy INTEGER NOT NULL DEFAULT 1,
  nameservers TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_domains_org ON domains(org_id);
CREATE TABLE dns_records (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  host TEXT NOT NULL DEFAULT '@',
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 3600,
  priority INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_dns_org_domain ON dns_records(org_id, domain);
CREATE TABLE domain_contacts (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  contact_type TEXT NOT NULL,
  dynadot_contact_id TEXT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'domains:read,dns:read',
  last_used_at INTEGER,
  expires_at INTEGER,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
-- Stripe wallet — top-up with custom amount, pay renewals/domains from balance
CREATE TABLE org_balances (
  org_id INTEGER PRIMARY KEY,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE balance_ledger (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  domain TEXT,
  stripe_session_id TEXT,
  stripe_event_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_ledger_org ON balance_ledger(org_id, created_at DESC);
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  org_id INTEGER,
  account_id INTEGER,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  last_error TEXT,
  processed_at INTEGER
);
-- Better Auth tables (minimal, better-auth will auto-migrate but keep for local)
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  emailVerified INTEGER,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  expiresAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE TABLE domain_forwards (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  host TEXT NOT NULL DEFAULT '@',
  target TEXT NOT NULL,
  code INTEGER NOT NULL DEFAULT 301,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_forwards_org_domain ON domain_forwards(org_id, domain);
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
