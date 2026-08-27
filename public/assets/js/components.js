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
  return `<span class="wordmark">name<mark class="wordmark__accent">nice</mark></span>`;
}

export function authNavLinks(signedIn) {
  if (signedIn) {
    return `<button type="button" class="site-nav__account-trigger" data-account-trigger aria-haspopup="true" aria-expanded="false">Account <span aria-hidden="true">\u2304</span></button>`;
  }
  return `<a href="/signin">Sign in</a><a href="/signup">Create account</a>`;
}

export function cartIcon({ count = 0 } = {}) {
  return `<a href="/cart" class="cart-icon" aria-label="Cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 5.5h1.4l.9 8.1a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.3l.8-6.2H5.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7.5" cy="17.5" r="1" fill="currentColor"/>
      <circle cx="14" cy="17.5" r="1" fill="currentColor"/>
    </svg>
    ${count > 0 ? `<span class="cart-icon__count">${count}</span>` : ""}
  </a>`;
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
  return `<article class="domain-result${selected ? " domain-result--selected" : ""}${favorited !== null ? " domain-result--with-favorite" : ""}">
    <div>
      <h3 class="domain-result__name">${selected ? '<span class="domain-result__selected-marker" aria-hidden="true">&check;</span>' : ""}${result.domain}</h3>
      <div class="domain-result__status">${statusBadge(result.status)}</div>
    </div>
    <div class="domain-result__price"><strong>${price}</strong><span>${result.cadence}</span></div>
    ${heartMarkup}
    <button class="text-action" type="button" data-domain="${result.domain}" data-action="${action}">${action}</button>
  </article>`;
}

export function domainSearch({ query, state = "initial", result, suggestions = [] }) {
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
      <span class="signature-search__tld">.net</span>
      <button class="signature-search__submit" type="button" ${isSearching ? "disabled" : ""}>${buttonLabel}</button>
    </div>
    <p id="search-helper" class="signature-search__helper">Search is free. Create an account when you're ready.</p>
    ${resultMarkup}
  </section>`;
}
