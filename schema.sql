-- Namenice index DB — clones blognice memberships + invitations + Analytics audit
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  billing_status TEXT NOT NULL DEFAULT 'inactive',
  created_at INTEGER NOT NULL
);
-- Org = billable team (like blognice tenants)
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- sub-accounts — same shape as blognice memberships schema.sql:189
CREATE TABLE organization_members (
  account_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner', -- owner | admin | billing | viewer
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, org_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_org_members_account ON organization_members(account_id);
CREATE INDEX idx_org_members_org ON organization_members(org_id);

-- invitations — clone blog_invitations (7-day, token_hash, bound to email)
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
  expires_at INTEGER,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
-- audit lives in Analytics Engine, not D1 (90-day via EVENTS blob1 LIKE 'audit:%')

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
  type TEXT NOT NULL, -- topup | debit | refund
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
