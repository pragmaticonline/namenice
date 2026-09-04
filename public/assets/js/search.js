import { button, cartIcon, favoriteHeartIcon, statusBadge, wordmark } from "./components.js";
import { domainSearchMock, nameSuggestionGroups } from "./mocks/domain-search-mock.js";
import { addToCart, addToHistory, isFavorited, isInCart, getHistory, toggleFavorite } from "./state.js";
import { bundleOptions, getBundleOption } from "./mocks/bundle-options.js";
import { initCartDrawer, pulseCartBadge, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";
import { initTldDropdown } from "./tld-dropdown.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
let query = params.get("q") || domainSearchMock.initialQuery;
let compareList = [];
let compareDrawerOpen = false;
let bundleScrollHandler = null;
let expandedSuggestionDomain = null; // inline-expanded item in "Names like this"
let selectedBundle = null; // set when user picks a bundle from "See options"; null = domain only // domains the user has explicitly added to compare, besides the primary result
let tld = params.get("tld") || ".net";
let searchError = null;
let isChecking = false;

// A valid domain label: letters, numbers, hyphens, 1-63 chars, no leading/trailing hyphen.
const VALID_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function splitDomain(domain) {
  const dot = domain.lastIndexOf(".");
  return { name: domain.slice(0, dot), tld: domain.slice(dot) };
}

async function fetchRealPrimary(domain) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(domain)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error || !data.domain) return null;
    return data;
  } catch { return null; }
}
let realPrimaryCache = null;
async function refreshRealPrimary() {
  const fallback = buildPrimary();
  const full = fallback.domain.includes(".") ? fallback.domain : fallback.domain + tld;
  const real = await fetchRealPrimary(full);
  if (real) { realPrimaryCache = real; try { render(); } catch {} }
  return real || fallback;
}

function buildPrimary() {
  // namenice only registers .net domains \u2014 the query name gets whichever
  // tld is currently selected; only .net actually returns real results.
  // Deterministic mock scenarios: typing "premium" or "taken" anywhere in
  // the query triggers that result, same pattern as transfer.js's
  // locked.net/invalid.net scenarios.
  const trimmed = (query.trim() || domainSearchMock.initialQuery).toLowerCase();
  let base;
  if (trimmed.includes("premium")) base = domainSearchMock.premium;
  else if (trimmed.includes("taken")) base = domainSearchMock.unavailable;
  else base = domainSearchMock.available;
  const name = query.trim() || domainSearchMock.initialQuery;
  return { ...base, domain: `${name}${tld}` };
}

function cartButtonMarkup(domain, compact = false) {
  const inCart = isInCart(domain);
  if (compact) {
    return inCart
      ? `<button class="button button--in-cart button--compact" type="button" data-cart-domain="${domain}" disabled><svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Added to cart</button>`
      : `<button class="button button--secondary button--compact" type="button" data-cart-domain="${domain}">Add to cart</button>`;
  }
  return inCart
    ? `<button class="button button--in-cart" type="button" data-cart-domain="${domain}" disabled><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> In your cart</button>`
    : `<button class="button button--primary" type="button" data-cart-domain="${domain}">Add to cart</button>`;
}

function bundleDropdownMarkup(domain, label = "Choose a bundle", tertiary = false) {
  return `
    <div class="bundle-select" data-bundle-select="${domain}">
      <button type="button" class="${tertiary ? "text-action bundle-select__trigger--text" : "bundle-select__trigger"}" data-bundle-trigger aria-haspopup="true" aria-expanded="false">${label} <span class="bundle-select__chevron" aria-hidden="true">\u2304</span></button>
      <div class="bundle-select__menu" hidden>
        ${bundleOptions.map((opt) => `
          <button type="button" class="bundle-select__option" data-bundle-option="${opt.id}">
            <span><strong>${opt.label}</strong><span class="bundle-select__desc">${opt.description}</span></span>
            <span class="bundle-select__price">$${opt.price.toFixed(2)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAvailableHero(primary, name, primaryTld, favorited) {
  return `
    <div class="results-hero your-search-panel your-search-panel--minimal">
      <div class="price-decision">
        <div class="price-decision__domain-row">
          <span class="price-decision__name">${name}<mark>${primaryTld}</mark></span>
          ${statusBadge(primary.status)}
        </div>
        ${selectedBundle && selectedBundle !== "domain" ? `
        <div class="price-decision__row">
          <div>
            <p class="price-decision__label">Registration</p>
            <p class="price-decision__amount">$${getBundleOption(selectedBundle).price.toFixed(2)}<span>/ first year</span></p>
          </div>
          <div>
            <p class="price-decision__label">Renewal</p>
            <p class="price-decision__amount price-decision__amount--muted">$${getBundleOption(selectedBundle).renewalPrice.toFixed(2)}<span>/ year</span></p>
          </div>
        </div>
        <p class="price-decision__bundle-note">with ${getBundleOption(selectedBundle).label.replace("Domain + ", "")}</p>
        ` : `
        <div class="price-decision__row">
          <div>
            <p class="price-decision__label">Registration</p>
            <p class="price-decision__amount">${primary.price}<span>${primary.cadence}</span></p>
          </div>
          <div>
            <p class="price-decision__label">Renewal</p>
            <p class="price-decision__amount price-decision__amount--muted">${primary.renewalPrice}<span>${primary.renewalCadence}</span></p>
          </div>
        </div>
        `}
        <div class="search-hero-actions">
          ${cartButtonMarkup(primary.domain)}
          <button type="button" class="compare-table__favorite" id="favorite-button" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${primary.domain} from favorites">${favoriteHeartIcon(favorited)}</button>
          ${bundleDropdownMarkup(primary.domain, "Options", true)}
        </div>
      </div>
    </div>
  `;
}

function renderPremiumCard(primary, favorited) {
  return `
    <div class="premium-card">
      <div class="premium-card__head">
        <div>
          <h3 class="domain-result__name">${primary.domain}</h3>
          ${statusBadge(primary.status)}
        </div>
        <div class="domain-result__price"><strong>${primary.price}</strong><span>${primary.cadence}</span></div>
      </div>
      <p class="taken-domain__dates">${primary.message}</p>
      <div class="premium-card__actions">
        ${cartButtonMarkup(primary.domain)}
        ${bundleDropdownMarkup(primary.domain)}
        <button type="button" class="compare-table__favorite" id="favorite-button" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${primary.domain} from favorites">${favoriteHeartIcon(favorited)}</button>
      </div>
    </div>
  `;
}

function renderUnavailableCard(primary) {
  return `
    <div class="taken-domain">
      <div class="taken-domain__header">
        <strong>${primary.domain}</strong>
        ${statusBadge(primary.status)}
      </div>
      <p class="taken-domain__dates">${primary.message}</p>
      <p class="taken-domain__dates">Registered ${primary.registeredDate} \u00b7 Expires ${primary.expiresDate}</p>
    </div>
  `;
}

function suggestionMockResult(domain) {
  // Front-end-only mock until the real availability/pricing API is connected.
  return { status: "available", price: "$12.99", renewalPrice: "$18.99", cadence: "/ year", domain };
}

function renderSuggestionDetails(domain) {
  const item = suggestionMockResult(domain);
  const favorited = isFavorited(domain);
  const inCompare = compareList.includes(domain);
  return `<div class="name-suggestions__details" data-suggestion-details="${domain}">
    <div class="name-suggestions__details-head">
      <div>
        <p class="name-suggestions__details-domain">${domain}</p>
        ${statusBadge(item.status)}
        <p class="name-suggestions__details-price">${item.price} first year \u00b7 ${item.renewalPrice} renewal / year</p>
      </div>
    </div>
    <div class="name-suggestions__details-actions">
      ${cartButtonMarkup(domain, true)}
      <button type="button" class="compare-table__favorite" data-favorite-domain="${domain}" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${domain} from favorites">${favoriteHeartIcon(favorited)}</button>
      <button type="button" class="text-action" data-suggestion-compare="${domain}" ${inCompare ? "disabled" : ""}>${inCompare ? "\u2713 Compared" : "+ Compare"}</button>
    </div>
  </div>`;
}

function compareRow(item, renewalPrice, renewalCadence, isPrimary) {
  const favorited = isFavorited(item.domain);
  return `<tr class="${isPrimary ? "compare-table__row--primary" : ""}">
    <td class="compare-table__domain">${isPrimary ? '<span class="compare-table__star" aria-hidden="true">\u2605</span>' : ""}${item.domain}</td>
    <td>${statusBadge(item.status)}</td>
    <td>${item.price ?? "\u2014"}</td>
    <td>${renewalPrice ?? "\u2014"}</td>
    <td><button class="compare-table__favorite" type="button" data-favorite-domain="${item.domain}" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${item.domain} from favorites">${favoriteHeartIcon(favorited)}</button></td>
    <td>${isPrimary ? "" : `<button type="button" class="compare-table__remove" data-remove-compare="${item.domain}" aria-label="Remove ${item.domain} from compare">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6 6l.6 9.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L14 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`}</td>
  </tr>`;
}

function render() {
  const primary = buildPrimary();
  const alsoAvailable = domainSearchMock.suggestions;
  const taken = domainSearchMock.unavailable;
  const { name, tld: primaryTld } = splitDomain(primary.domain);
  const favorited = isFavorited(primary.domain);
  const history = getHistory().slice(0, 3);

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="search.html" class="site-nav__tab is-active">Search</a>
        <a href="history.html" class="site-nav__tab">History</a>
        <a href="favorites.html" class="site-nav__tab">Favorites</a>
        <a href="transfer.html" class="site-nav__tab site-nav__tab--secondary">Transfer a domain</a>
      </div>
      <div class="site-nav__links">
        <span data-auth-slot>
          <a href="signin.html">Sign in</a>
          <a href="signup.html">Create account</a>
        </span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Search domains</h1>
      <div class="signature-search__frame">
        <span class="signature-search__icon" aria-hidden="true">\u2315</span>
        <input id="search-input" class="signature-search__input" value="${query}" aria-label="Search your domain name" aria-invalid="${searchError ? "true" : "false"}" aria-describedby="${searchError ? "search-error" : ""}" />
        <button type="button" class="signature-search__tld" data-tld-trigger aria-haspopup="true" aria-expanded="false">${tld} <span aria-hidden="true">\u2304</span></button>
        <button class="signature-search__submit" id="search-submit" type="button" ${isChecking ? "disabled" : ""}>${isChecking ? "Checking\u2026" : "Search"}</button>
      </div>
      ${searchError ? `<p class="field-help" id="search-error" style="color: var(--color-error); margin-top: var(--space-2);">${searchError}</p>` : ""}
      ${history.length > 0 ? `<p class="recent-searches-inline">Recent: ${history.map((entry) => `<a href="search.html?q=${encodeURIComponent(entry.query)}">${entry.query}</a>`).join(' <span aria-hidden="true">\u00b7</span> ')}</p>` : ""}
    </section>

    <section class="results-block">
      <p class="results-block__label">Your search</p>
      ${primary.status === "available" ? renderAvailableHero(primary, name, primaryTld, favorited) : ""}
      ${primary.status === "premium" ? renderPremiumCard(primary, favorited) : ""}
      ${primary.status === "unavailable" ? renderUnavailableCard(primary) : ""}
    </section>

    <section class="results-block">
      <p class="results-block__label">Also available</p>
      <div class="compact-result-list">
        ${alsoAvailable.map((item) => `
          <div class="compact-result-row">
            <span class="compact-result-row__name">${item.domain}</span>
            <span class="compact-result-row__price">${item.price}</span>
            <div class="compact-result-row__actions">
              <button type="button" class="compare-table__favorite" data-favorite-domain="${item.domain}" aria-pressed="${isFavorited(item.domain)}" aria-label="${isFavorited(item.domain) ? "Remove" : "Add"} ${item.domain} from favorites">${favoriteHeartIcon(isFavorited(item.domain))}</button>
              <button type="button" class="text-action compact-result-row__compare" data-add-compare="${item.domain}" ${compareList.includes(item.domain) ? "disabled" : ""}>${compareList.includes(item.domain) ? "\u2713 Compared" : "+ Compare"}</button>
              ${cartButtonMarkup(item.domain, true)}
            </div>
          </div>
        `).join("")}
      </div>
      <button type="button" class="text-action compare-open-link" data-open-compare>Compare ${1 + compareList.length} domain${compareList.length ? "s" : ""} \u2192</button>
    </section>

    <div class="compare-drawer-backdrop" data-close-compare ${compareDrawerOpen ? "" : "hidden"}></div>
    <aside class="compare-drawer" ${compareDrawerOpen ? "" : "hidden"}>
      <div class="compare-drawer__header">
        <p class="results-block__label" style="margin:0;">Compare your options</p>
        <button type="button" class="orders-detail__close" data-close-compare aria-label="Close">\u2715</button>
      </div>
      <p class="taken-domain__dates">Your search result is compared automatically. Add any name from the list to compare it here too.</p>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr><th>Domain</th><th>Status</th><th>First year</th><th>Renewal</th><th></th><th></th></tr>
          </thead>
          <tbody>
            ${compareRow(primary, primary.renewalPrice, primary.renewalCadence, true)}
            ${compareList.map((domain) => alsoAvailable.find((a) => a.domain === domain)).filter(Boolean).map((item) => compareRow(item, null, null, false)).join("")}
          </tbody>
        </table>
      </div>
      <p class="taken-domain__dates" style="margin-top: var(--space-5);">Add from the list below:</p>
      <div class="compact-result-list">
        ${alsoAvailable.map((item) => `
          <div class="compact-result-row">
            <span class="compact-result-row__name">${item.domain}</span>
            <button type="button" class="text-action" data-add-compare="${item.domain}" ${compareList.includes(item.domain) ? "disabled" : ""}>${compareList.includes(item.domain) ? "\u2713 Added" : "+ Add"}</button>
          </div>
        `).join("")}
      </div>
    </aside>

    <section class="results-block">
      <p class="results-block__label">Names like this</p>
      <div class="name-suggestions name-suggestions--compact">
        ${nameSuggestionGroups.map((group) => `
          <div class="name-suggestions__group">
            <span class="name-suggestions__label">${group.label}:</span>
            ${group.names.map((domain, i) => `
              <span class="name-suggestions__item">
                <button type="button" class="name-suggestions__item-toggle ${expandedSuggestionDomain === domain ? "is-open" : ""}" data-suggestion-toggle="${domain}" aria-expanded="${expandedSuggestionDomain === domain}">${domain}</button>
              </span>
              ${i < group.names.length - 1 ? '<span aria-hidden="true"> \u00b7 </span>' : ""}
              ${expandedSuggestionDomain === domain ? renderSuggestionDetails(domain) : ""}
            `).join("")}
          </div>
        `).join("")}
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Already registered</p>
      <div class="taken-domain">
        <div class="taken-domain__header">
          <strong>${taken.domain}</strong>
          ${statusBadge(taken.status)}
        </div>
        <p class="taken-domain__dates">Registered ${taken.registeredDate} \u00b7 Expires ${taken.expiresDate}</p>
      </div>
    </section>

    <p class="trust-row trust-row--compact">Free WHOIS privacy \u00b7 No hidden fees \u00b7 24/7 human support \u00b7 DNS you can trust</p>

    <footer class="site-footer">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-footer__text">
        <p>Domains, without the noise. \u00b7 <a href="transfer.html" style="color:inherit;">Transfer a domain</a></p>
        <p class="site-footer__copyright">\u00a9 2026 namenice. All rights reserved.</p>
      </div>
    </footer>
  `;
  bindEvents(primary);
  updateCartBadges();
  updateAuthNav();
}

function bindEvents(primary) {
  if (bundleScrollHandler) {
    window.removeEventListener("scroll", bundleScrollHandler, true);
    bundleScrollHandler = null;
  }

  const input = document.querySelector("#search-input");
  const submit = document.querySelector("#search-submit");
  input.addEventListener("input", (event) => { query = event.target.value; });
  submit.addEventListener("click", () => {
    if (tld !== ".net") {
      searchError = "namenice currently supports .net searches only. Switch to .net to continue.";
      render();
      return;
    }
    const trimmed = query.trim();
    if (!trimmed || !VALID_LABEL.test(trimmed)) {
      searchError = "Enter a valid .net domain name.";
      render();
      document.querySelector("#search-input").focus();
      return;
    }
    searchError = null;
    isChecking = true;
    render();
    window.setTimeout(() => {
      isChecking = false;
      addToHistory(query, { domain: primary.domain, status: primary.status, price: primary.price, cadence: primary.cadence });
      const url = new URL(window.location.href);
      url.searchParams.set("q", query);
      url.searchParams.set("tld", tld);
      window.history.replaceState({}, "", url);
      render();
    }, 500);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit.click();
  });

  const favoriteBtn = document.querySelector("#favorite-button");
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", () => {
      toggleFavorite({ domain: primary.domain, status: primary.status, price: primary.price, cadence: primary.cadence });
      render();
    });
  }

  document.querySelectorAll("[data-favorite-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.favoriteDomain;
      const known = domain === primary.domain
        ? primary
        : domainSearchMock.suggestions.find((s) => s.domain === domain);
      toggleFavorite(known ? { domain: known.domain, status: known.status, price: known.price, cadence: known.cadence } : { domain });
      render();
    });
  });

  document.querySelectorAll("[data-cart-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.cartDomain;
      const item = domain === primary.domain
        ? primary
        : domainSearchMock.suggestions.find((s) => s.domain === domain) || suggestionMockResult(domain);
      if (!item) return;
      if (domain === primary.domain && selectedBundle && selectedBundle !== "domain") {
        const bundle = getBundleOption(selectedBundle);
        addToCart({ domain, price: `$${bundle.price.toFixed(2)}`, cadence: "/ first year", bundle: selectedBundle });
      } else {
        addToCart({ domain: item.domain, price: item.price, cadence: item.cadence });
      }
      pulseCartBadge();
      render();
    });
  });

  function positionBundleMenu(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 300;
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 16);
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(16, left)}px`;
  }

  function closeBundleMenu() {
    document.querySelectorAll(".bundle-select__menu").forEach((m) => { m.hidden = true; });
    document.querySelectorAll("[data-bundle-trigger]").forEach((t) => { t.setAttribute("aria-expanded", "false"); t.classList.remove("is-open"); });
    if (bundleScrollHandler) {
      window.removeEventListener("scroll", bundleScrollHandler, true);
      bundleScrollHandler = null;
    }
  }

  document.querySelectorAll("[data-bundle-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = trigger.nextElementSibling;
      const wasHidden = menu.hidden;
      closeBundleMenu();
      if (wasHidden) {
        positionBundleMenu(trigger, menu);
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.add("is-open");
        bundleScrollHandler = () => positionBundleMenu(trigger, menu);
        window.addEventListener("scroll", bundleScrollHandler, true);
      }
    });
  });
  document.querySelectorAll("[data-bundle-option]").forEach((opt) => {
    opt.addEventListener("click", () => {
      selectedBundle = opt.dataset.bundleOption;
      render();
    });
  });
  document.addEventListener("click", closeBundleMenu);
  window.addEventListener("resize", closeBundleMenu);

  document.querySelectorAll("[data-open-compare]").forEach((btn) => {
    btn.addEventListener("click", () => { compareDrawerOpen = true; render(); });
  });
  document.querySelectorAll("[data-close-compare]").forEach((btn) => {
    btn.addEventListener("click", () => { compareDrawerOpen = false; render(); });
  });

  document.querySelectorAll("[data-add-compare]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.addCompare;
      if (!compareList.includes(domain)) compareList.push(domain);
      render();
    });
  });
  document.querySelectorAll("[data-remove-compare]").forEach((btn) => {
    btn.addEventListener("click", () => {
      compareList = compareList.filter((d) => d !== btn.dataset.removeCompare);
      render();
    });
  });

  document.querySelectorAll("[data-suggestion-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.suggestionToggle;
      expandedSuggestionDomain = expandedSuggestionDomain === domain ? null : domain;
      render();
      if (expandedSuggestionDomain === domain) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-suggestion-details="${CSS.escape(domain)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    });
  });

  document.querySelectorAll("[data-suggestion-compare]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.suggestionCompare;
      if (!compareList.includes(domain)) compareList.push(domain);
      render();
    });
  });

  document.querySelectorAll('[data-domain][data-action="Add"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = domainSearchMock.suggestions.find((s) => s.domain === btn.dataset.domain);
      if (!item) return;
      addToCart({ domain: item.domain, price: item.price, cadence: item.cadence });
      pulseCartBadge();
    });
  });
}

render();
initCartDrawer();
initAccountMenu();
initTldDropdown((selectedTld) => {
  tld = selectedTld;
  searchError = null;
  render();
});

// If the browser restores this page from back-forward cache (e.g. the user
// hit Back after removing an item from the cart on another page), the DOM
// is restored as a stale snapshot without re-running this script. Force a
// fresh render so cart/favorite state reflects reality again.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) render();
});
