const statusCopy = {
  available: "Available",
  unavailable: "Unavailable",
  premium: "Premium domain",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function wordmark() {
  return `<span class="wordmark">namenice<span class="wordmark__dot" aria-hidden="true">.</span></span>`;
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export function authNavLinks(signedIn, username) {
  if (signedIn) {
    return `<button type="button" class="topnav__avatar" data-account-trigger aria-haspopup="true" aria-expanded="false" aria-label="Account">${escapeHtml(String(username || "n").trim().charAt(0).toUpperCase() || "N")}</button>`;
  }
  return `<a href="/#pricing" class="topnav__link">Pricing</a><a href="/transfer" class="topnav__link">Transfer</a><a href="/signin" class="topnav__link">Sign in</a><a href="/signup" class="topnav__cta">Get started</a>`;
}

export function cartIcon({ count = 0 } = {}) {
  return `<a href="/cart" class="cart-icon" aria-label="Cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}">Cart${count > 0 ? `<span class="cart-icon__count">${count}</span>` : ""}</a>`;
}

export function statusBadge(status) {
  return `<span class="status-badge status-badge--${status}"><span aria-hidden="true">●</span> ${statusCopy[status]}</span>`;
}

export function button({ label, kind = "primary", state = "default", disabled = false }) {
  const disabledAttribute = disabled ? "disabled" : "";
  return `<button class="button button--${kind} button--${state}" type="button" ${disabledAttribute}>${label}</button>`;
}

export function favoriteHeartIcon(favorited) {
  return `<svg width="14" height="14" viewBox="0 0 20 20" fill="${favorited ? "currentColor" : "none"}" aria-hidden="true"><path d="M10 17.2s-6.8-4.1-6.8-9.1a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5-6.8 9.1-6.8 9.1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

export function domainResultRow(result, { selected = false, action = "Add", favorited = null } = {}) {
  const price = result.price ?? "—";
  const heartMarkup = favorited === null ? "" : `<button type="button" class="compare-table__favorite" data-favorite-domain="${result.domain}" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${result.domain} from favorites">${favoriteHeartIcon(favorited)}</button>`;
  const isAddToCart = action === "Add";
  const actionMarkup = isAddToCart
    ? `<button class="button button--secondary domain-result__action" type="button" data-domain="${result.domain}" data-action="${action}">Add to cart</button>`
    : `<button class="text-action domain-result__action" type="button" data-domain="${result.domain}" data-action="${action}">${action}</button>`;
  return `<article class="domain-result${selected ? " domain-result--selected" : ""}${favorited !== null ? " domain-result--with-favorite" : ""}">
    <div>
      <h3 class="domain-result__name">${selected ? '<span class="domain-result__selected-marker" aria-hidden="true">&check;</span>' : ""}${result.domain}</h3>
      <div class="domain-result__status">${statusBadge(result.status)}</div>
    </div>
    <div class="domain-result__price"><strong>${price}</strong><span>${result.cadence ?? ""}</span></div>
    <div class="domain-result__actions">
      ${heartMarkup}
      ${actionMarkup}
    </div>
  </article>`;
}

export function domainSearch({ query, state = "initial", result, suggestions = [], tld = ".net" }) {
  const safeQuery = escapeHtml(query.trim() || "Search your domain name");
  const isSearching = state === "searching";
  const isResult = ["available", "unavailable", "premium", "selected"].includes(state);
  const buttonLabel = isSearching ? "Checking…" : "Check availability";
  const resultMarkup = isResult && result
    ? `<section class="search-result" aria-live="polite">
        ${domainResultRow(result, { selected: state === "selected", action: state === "available" ? "Continue" : state === "unavailable" ? "See options" : "View terms" })}
        <p class="search-result__message">${result.message}</p>
        ${suggestions.length ? `<div class="suggestion-list"><p>Suggestions</p>${suggestions.map((item) => domainResultRow(item, { action: "Add" })).join("")}</div>` : ""}
      </section>`
    : "";

  return `<section class="signature-search" data-search-state="${state}">
    <div class="signature-search__frame">
      <label class="sr-only" for="domain-search-input">Search for a domain</label>
      <span class="signature-search__icon" aria-hidden="true">⌕</span>
      <input id="domain-search-input" class="signature-search__input" value="${safeQuery}" aria-describedby="search-helper" />
      <button type="button" class="signature-search__tld" data-tld-trigger aria-haspopup="true" aria-expanded="false">${tld} <span aria-hidden="true">⌄</span></button>
      <button class="signature-search__submit" type="button" ${isSearching ? "disabled" : ""}>${buttonLabel}</button>
    </div>
    <p id="search-helper" class="signature-search__helper">Search is free. Create an account when you're ready.</p>
    ${resultMarkup}
  </section>`;
}
