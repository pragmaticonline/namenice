const FAVORITES_KEY = "namenice_favorites";
const HISTORY_KEY = "namenice_history";
const CART_KEY = "namenice_cart";
const HISTORY_LIMIT = 8;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  })[character]);
}

function readList(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || "[]"); }
  catch { return []; }
}

function writeList(key, list) {
  try { window.localStorage.setItem(key, JSON.stringify(list)); }
  catch { /* Browsing can continue when storage is unavailable. */ }
}

export function getFavorites() { return readList(FAVORITES_KEY); }
export function isFavorited(domain) { return getFavorites().some((item) => item.domain === domain); }
export function toggleFavorite(item) {
  const list = getFavorites();
  const adding = !list.some((entry) => entry.domain === item.domain);
  writeList(FAVORITES_KEY, adding ? [...list, { domain:item.domain, addedAt:Date.now() }] : list.filter((entry) => entry.domain !== item.domain));
  return adding;
}

export function getHistory() { return readList(HISTORY_KEY); }
export function addToHistory(query, result) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const existing = getHistory().filter((entry) => entry.query.toLowerCase() !== trimmed.toLowerCase());
  writeList(HISTORY_KEY, [{ query:trimmed, at:Date.now(), result:result ?? null }, ...existing].slice(0, HISTORY_LIMIT));
}

export function getCart() { return readList(CART_KEY); }
export function getCartCount() { return getCart().length; }
export function addToCart(item) {
  const list = getCart();
  if (list.some((entry) => entry.domain === item.domain)) return list;
  const next = [...list, { domain:item.domain, price:item.price, cadence:item.cadence }];
  writeList(CART_KEY, next);
  return next;
}
export function removeFromCart(domain) {
  const next = getCart().filter((item) => item.domain !== domain);
  writeList(CART_KEY, next);
  return next;
}
export function clearCart() { writeList(CART_KEY, []); }
