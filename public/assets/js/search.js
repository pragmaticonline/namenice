import { button, cartIcon, domainResultRow, favoriteHeartIcon, statusBadge, wordmark } from "./components.js";
import { domainSearchMock, nameSuggestionGroups } from "./mocks/domain-search-mock.js";
import { addToCart, addToHistory, isFavorited, getHistory, toggleFavorite } from "./state.js";
import { initCartDrawer, pulseCartBadge, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
let query = params.get("q") || domainSearchMock.initialQuery;
let searchError = null;
let isChecking = false;

// A valid domain label: letters, numbers, hyphens, 1-63 chars, no leading/trailing hyphen.
const VALID_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function splitDomain(domain) {
  const dot = domain.lastIndexOf(".");
  return { name: domain.slice(0, dot), tld: domain.slice(dot) };
}

function buildPrimary() {
  // namenice only registers .net domains \u2014 the query name gets the .net
  // suffix, there is no TLD to choose.
  const base = domainSearchMock.available;
  const name = splitDomain(base.domain).name;
  return { ...base, domain: `${name}.net` };
}

function compareRow(item, renewalPrice, renewalCadence, isPrimary) {
  const favorited = isFavorited(item.domain);
  return `<tr class="${isPrimary ? "compare-table__row--primary" : ""}">
    <td class="compare-table__domain">${isPrimary ? '<span class="compare-table__star" aria-hidden="true">\u2605</span>' : ""}${item.domain}</td>
    <td>${statusBadge(item.status)}</td>
    <td>${item.price ?? "\u2014"}</td>
    <td>${renewalPrice ?? "\u2014"}</td>
    <td><button class="compare-table__favorite" type="button" data-favorite-domain="${item.domain}" aria-pressed="${favorited}" aria-label="${favorited ? "Remove" : "Add"} ${item.domain} from favorites">${favoriteHeartIcon(favorited)}</button></td>
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
      <div class="search-toolbar__layout">
        <div>
          <h1 class="search-toolbar__heading">Search domains</h1>
          <div class="search-toolbar__bar">
            <div class="signature-search__frame">
              <span class="signature-search__icon" aria-hidden="true">\u2315</span>
              <input id="search-input" class="signature-search__input" value="${query}" aria-label="Search your domain name" aria-invalid="${searchError ? "true" : "false"}" aria-describedby="${searchError ? "search-error" : ""}" />
              <span class="signature-search__tld">.net</span>
              <button class="signature-search__submit" id="search-submit" type="button" ${isChecking ? "disabled" : ""}>${isChecking ? "Checking\u2026" : "Search"}</button>
            </div>
            ${searchError ? `<p class="field-help" id="search-error" style="color: var(--color-error); margin-top: var(--space-2);">${searchError}</p>` : ""}
          </div>
        </div>
        ${history.length > 0 ? `
        <div class="recent-searches">
          <p class="recent-searches__label">Recent searches</p>
          <ul>
            ${history.map((entry) => `<li><a href="search.html?q=${encodeURIComponent(entry.query)}">${entry.query}</a></li>`).join("")}
          </ul>
          <a class="text-action" href="history.html">View all history \u2192</a>
        </div>` : ""}
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Your search</p>
      <div class="results-hero your-search-panel">
        <div class="price-decision">
          <div class="price-decision__domain">
            <span class="price-decision__name">${name}<mark>${primaryTld}</mark></span>
          </div>
          ${statusBadge(primary.status)}
          <p class="price-decision__lede">Secure it today. This domain is ready to register.</p>
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
          <div class="price-decision__actions">
            ${button({ label: "Add to cart" })}
            <button class="button button--secondary" id="favorite-button" type="button" aria-pressed="${favorited}">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="${favorited ? "currentColor" : "none"}" aria-hidden="true"><path d="M10 17.2s-6.8-4.1-6.8-9.1a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5-6.8 9.1-6.8 9.1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
              ${favorited ? "Favorited" : "Add to Favorite"}
            </button>
          </div>
        </div>
        <div class="why-great">
          <p class="why-great__label">Why it\u2019s great</p>
          <div class="why-great__item">
            <span class="why-great__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 12l4-4M7 9l-1.5 1.5a2.8 2.8 0 0 0 4 4L11 13M13 11l1.5-1.5a2.8 2.8 0 0 0-4-4L9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
            <div><strong>Short and memorable</strong><span>Easy to say, easy to remember.</span></div>
          </div>
          <div class="why-great__item">
            <span class="why-great__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3l1.8 3.9 4.2.5-3.1 3 .8 4.3L10 12.6 6.3 14.7l.8-4.3-3.1-3 4.2-.5L10 3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
            <div><strong>Clear and confident</strong><span>Reads well in any context.</span></div>
          </div>
          <div class="why-great__item">
            <span class="why-great__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M3 10h14M10 3a11 11 0 0 1 0 14M10 3a11 11 0 0 0 0 14" stroke="currentColor" stroke-width="1.2"/></svg></span>
            <div><strong>Established extension</strong><span>.net has been part of the web since 1985.</span></div>
          </div>
        </div>
        <div class="hero-mark" aria-hidden="true">
          <div class="hero-mark__ring">
            <svg class="hero-mark__check" viewBox="0 0 24 24" fill="none"><path d="M5 13l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="hero-mark__dots"></div>
        </div>
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Also available</p>
      <div class="row-group">
        ${alsoAvailable.map((item) => domainResultRow(item, { action: item.status === "premium" ? "View" : "Add", favorited: isFavorited(item.domain) })).join("")}
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Compare your options</p>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr><th>Domain</th><th>Status</th><th>First year</th><th>Renewal</th><th></th></tr>
          </thead>
          <tbody>
            ${compareRow(primary, primary.renewalPrice, primary.renewalCadence, true)}
            ${alsoAvailable.map((item) => compareRow(item, null, null, false)).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Names like this</p>
      <div class="name-suggestions">
        ${nameSuggestionGroups.map((group) => `
          <div class="name-suggestions__group">
            <p class="name-suggestions__label">${group.label}</p>
            ${group.names.map((domain) => `
              <div class="name-suggestions__row">
                <a href="search.html?q=${encodeURIComponent(splitDomain(domain).name)}">${domain}</a>
                <button type="button" class="compare-table__favorite" data-favorite-domain="${domain}" aria-pressed="${isFavorited(domain)}" aria-label="${isFavorited(domain) ? "Remove" : "Add"} ${domain} from favorites">${favoriteHeartIcon(isFavorited(domain))}</button>
              </div>
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
        <div class="taken-domain__actions">
          <a class="text-action" href="#">View domain details</a>
        </div>
      </div>
    </section>

    <div class="trust-row">
      <div class="trust-row__item">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.4"/></svg>
        <div><strong>Free WHOIS privacy</strong><span>On every eligible domain</span></div>
      </div>
      <div class="trust-row__item">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <div><strong>DNS you can trust</strong><span>Fast, secure, and reliable</span></div>
      </div>
      <div class="trust-row__item">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M7 10.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div><strong>24/7 human support</strong><span>Real people, real help</span></div>
      </div>
      <div class="trust-row__item">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3.5" y="4.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 8h13" stroke="currentColor" stroke-width="1.4"/></svg>
        <div><strong>No hidden fees</strong><span>What you see is what you pay</span></div>
      </div>
    </div>
  `;
  bindEvents(primary);
  updateCartBadges();
  updateAuthNav();
}

function bindEvents(primary) {
  const input = document.querySelector("#search-input");
  const submit = document.querySelector("#search-submit");
  input.addEventListener("input", (event) => { query = event.target.value; });
  submit.addEventListener("click", () => {
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
      window.history.replaceState({}, "", url);
      render();
    }, 500);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit.click();
  });

  document.querySelector("#favorite-button").addEventListener("click", () => {
    toggleFavorite({ domain: primary.domain, status: primary.status, price: primary.price, cadence: primary.cadence });
    render();
  });

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

  document.querySelector(".price-decision__actions .button--primary").addEventListener("click", () => {
    addToCart({ domain: primary.domain, price: primary.price, cadence: primary.cadence });
    pulseCartBadge();
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
