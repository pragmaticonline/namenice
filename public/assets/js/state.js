const FAVORITES_KEY = "namenice_favorites";
const HISTORY_KEY = "namenice_history";
const CART_KEY = "namenice_cart";
const ORDERS_KEY = "namenice_orders";
const DOMAINS_KEY = "namenice_owned_domains";
const TRANSFERS_KEY = "namenice_transfer_requests";
const HISTORY_LIMIT = 8;


function readList(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode, quota, etc). Fail silently \u2014
    // the UI still works for the current page load, it just won't persist.
  }
}

export function getFavorites() {
  return readList(FAVORITES_KEY);
}

export function isFavorited(domain) {
  return getFavorites().some((item) => item.domain === domain);
}

/**
 * Toggles a domain in the favorites list. `item` is `{ domain, status?, price?, cadence? }` \u2014
 * status/price are optional because a domain can be favorited from a context
 * that hasn't checked availability yet (e.g. a name idea, not a search result).
 * Returns the new favorited state (true/false).
 */
export function toggleFavorite(item) {
  const list = getFavorites();
  const nowFavorited = !list.some((existing) => existing.domain === item.domain);
  const next = nowFavorited
    ? [...list, { domain: item.domain, status: item.status ?? null, price: item.price ?? null, cadence: item.cadence ?? null, addedAt: Date.now() }]
    : list.filter((existing) => existing.domain !== item.domain);
  writeList(FAVORITES_KEY, next);
  return nowFavorited;
}

export function removeFavorite(domain) {
  writeList(FAVORITES_KEY, getFavorites().filter((item) => item.domain !== domain));
}

export function getHistory() {
  return readList(HISTORY_KEY);
}

/** result (optional): { domain, status, price, cadence } \u2014 a snapshot of what the search found, so history can show status too, not just the query text. */
export function addToHistory(query, result) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const existing = getHistory().filter((entry) => entry.query.toLowerCase() !== trimmed.toLowerCase());
  const next = [{ query: trimmed, at: Date.now(), result: result ?? null }, ...existing].slice(0, HISTORY_LIMIT);
  writeList(HISTORY_KEY, next);
}

export function clearHistory() {
  writeList(HISTORY_KEY, []);
}

export function getCart() {
  return readList(CART_KEY);
}

export function getCartCount() {
  return getCart().length;
}

export function isInCart(domain) {
  return getCart().some((item) => item.domain === domain);
}

/** item: { domain, price, cadence }. price is display metadata; checkout uses the server-authoritative registration price. */
export function addToCart(item) {
  const list = getCart();
  if (list.some((existing) => existing.domain === item.domain)) return list;
  const next = [...list, { ...item, bundle: item.bundle || "domain" }];
  writeList(CART_KEY, next);
  return next;
}

export function setCartItemBundle(domain, bundleId) {
  const next = getCart().map((item) => (item.domain === domain ? { ...item, bundle: bundleId } : item));
  writeList(CART_KEY, next);
  return next;
}

export function removeFromCart(domain) {
  const next = getCart().filter((item) => item.domain !== domain);
  writeList(CART_KEY, next);
  return next;
}

export function clearCart() {
  writeList(CART_KEY, []);
}

export function getCartSubtotal() {
  return getCart().reduce((sum, item) => {
    const value = parseFloat(String(item.price).replace(/[^0-9.]/g, ""));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ---------- Orders ----------

export function getOrders() {
  return readList(ORDERS_KEY);
}

/** order: { id, domain, price, cadence, bundleLabel, total, at, email } */
export function addOrder(order) {
  const next = [order, ...getOrders()];
  writeList(ORDERS_KEY, next);
  return next;
}

// ---------- Owned domains (My Domains) ----------

const RENEWAL_PRICE = 18.99; // reuses the same renewal rate already established for .net across the app

function defaultDnsRecords(domain) {
  return [
    { type: "A", name: "@", value: "192.0.2.1", ttl: "1 hour" },
    { type: "CNAME", name: "www", value: domain, ttl: "1 hour" },
    { type: "MX", name: "@", value: `mail.${domain}`, ttl: "1 hour" },
  ];
}

export function getOwnedDomains() {
  return readList(DOMAINS_KEY);
}

export function getOwnedDomain(domain) {
  return getOwnedDomains().find((d) => d.domain === domain) || null;
}

/** Registers a purchased domain into My Domains. Called once, right after a mock checkout completes. */
export function addOwnedDomain({ domain, bundleLabel }) {
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const record = {
    domain,
    status: "active",
    bundleLabel: bundleLabel || "Domain only",
    registeredAt: now,
    expiresAt: now + oneYearMs,
    autoRenew: true,
    privacy: true,
    renewalPrice: RENEWAL_PRICE,
    dns: defaultDnsRecords(domain),
  };
  const next = [...getOwnedDomains(), record];
  writeList(DOMAINS_KEY, next);
  return record;
}

export function updateOwnedDomain(domain, patch) {
  const next = getOwnedDomains().map((d) => (d.domain === domain ? { ...d, ...patch } : d));
  writeList(DOMAINS_KEY, next);
  return next;
}

export function setAutoRenew(domain, value) {
  return updateOwnedDomain(domain, { autoRenew: value });
}

export function renewOwnedDomain(domain, years = 1) {
  const owned = getOwnedDomain(domain);
  if (!owned) return null;
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  const base = owned.expiresAt > Date.now() ? owned.expiresAt : Date.now();
  const nextExpiry = base + years * yearMs;
  updateOwnedDomain(domain, { expiresAt: nextExpiry });
  return nextExpiry;
}

export function addDnsRecord(domain, record) {
  const next = getOwnedDomains().map((d) => (d.domain === domain ? { ...d, dns: [...d.dns, record] } : d));
  writeList(DOMAINS_KEY, next);
  return next;
}

export function removeDnsRecord(domain, index) {
  const next = getOwnedDomains().map((d) => (d.domain === domain ? { ...d, dns: d.dns.filter((_, i) => i !== index) } : d));
  writeList(DOMAINS_KEY, next);
  return next;
}

export function updateDnsRecord(domain, index, record) {
  const next = getOwnedDomains().map((d) => (d.domain === domain
    ? { ...d, dns: d.dns.map((r, i) => (i === index ? { ...r, ...record } : r)) }
    : d));
  writeList(DOMAINS_KEY, next);
  return next;
}

// ---------- Transfer requests (domains being transferred IN to namenice) ----------
// Deliberately kept separate from getOwnedDomains() \u2014 a transfer is not an
// owned/active domain until it completes. My Domains merges both when it renders.

export function getTransferRequests() {
  return readList(TRANSFERS_KEY);
}

export function getTransferRequest(domain) {
  return getTransferRequests().find((t) => t.domain === domain) || null;
}

/**
 * Starts a transfer request. Per prototype scope, the authorization code
 * itself is never persisted \u2014 only whether one was provided.
 */
export function addTransferRequest({ domain, price, renewalExtension }) {
  const now = Date.now();
  const record = {
    id: `TRF-${new Date(now).getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    domain,
    status: "pending", // pending | completed | failed | cancelled
    startedAt: now,
    authorizationCodeProvided: true,
    price,
    renewalExtension,
    createdAt: now,
  };
  const next = [...getTransferRequests(), record];
  writeList(TRANSFERS_KEY, next);
  return record;
}

export function updateTransferRequest(domain, patch) {
  const next = getTransferRequests().map((t) => (t.domain === domain ? { ...t, ...patch } : t));
  writeList(TRANSFERS_KEY, next);
  return next;
}
