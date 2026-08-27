import { button, cartIcon, domainResultRow, favoriteHeartIcon, wordmark } from "./components.js";
import { getFavorites, removeFavorite, addToCart, formatRelativeTime } from "./state.js";
import { initCartDrawer, pulseCartBadge, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

function actionForStatus(status) {
  if (status === "premium") return "View";
  if (status === "unavailable") return "See options";
  return "Add";
}

function render() {
  const favorites = getFavorites();
  const checked = favorites.filter((item) => item.status);
  const unchecked = favorites.filter((item) => !item.status);

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="/" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="/search" class="site-nav__tab">Search</a>
        <a href="/history" class="site-nav__tab">History</a>
        <a href="/favorites" class="site-nav__tab is-active">Favorites</a>
        <a href="/transfer" class="site-nav__tab site-nav__tab--secondary">Transfer a domain</a>
      </div>
      <div class="site-nav__links">
        <span data-auth-slot>
          <a href="/signin">Sign in</a>
          <a href="/signup">Create account</a>
        </span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Search domains</h1>
      <div class="search-toolbar__bar">
        <div class="signature-search__frame">
          <span class="signature-search__icon" aria-hidden="true">\u2315</span>
          <input id="jump-search-input" class="signature-search__input" placeholder="Search your domain name" aria-label="Search your domain name" />
          <span class="signature-search__tld">.net</span>
          <button class="signature-search__submit" id="jump-search-submit" type="button">Search</button>
        </div>
      </div>
    </section>

    <section class="results-block">
      <p class="results-block__label">Favorites${favorites.length > 0 ? ` (${favorites.length})` : ""}</p>
      ${favorites.length === 0 ? `
        <p class="taken-domain__dates">No favorites yet. Tap the heart on any domain to save it here.</p>
        <div class="taken-domain__actions">${button({ label: "Search domains" })}</div>
      ` : `
        ${checked.length > 0 ? `
          <div class="row-group">
            ${checked.map((item) => domainResultRow(item, { action: actionForStatus(item.status), favorited: true })).join("")}
          </div>
        ` : ""}
        ${unchecked.length > 0 ? `
          <div class="row-group" style="margin-top: ${checked.length > 0 ? "var(--space-6)" : "0"};">
            ${unchecked.map((item) => renderUncheckedRow(item)).join("")}
          </div>
        ` : ""}
      `}
    </section>
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function renderUncheckedRow(item) {
  return `
    <div class="taken-domain" style="padding: var(--space-5) 0; border-top: var(--border-default);">
      <div class="taken-domain__header">
        <strong>${item.domain}</strong>
        <button type="button" class="compare-table__favorite" data-favorite-domain="${item.domain}" aria-pressed="true" aria-label="Remove ${item.domain} from favorites">${favoriteHeartIcon(true)}</button>
      </div>
      <p class="taken-domain__dates">Not checked yet \u00b7 Added ${formatRelativeTime(item.addedAt)}</p>
      <div class="taken-domain__actions">
        <a class="text-action" href="/search?q=${encodeURIComponent(item.domain.split(".")[0])}">Check availability \u2192</a>
      </div>
    </div>
  `;
}

function bindEvents() {
  const jumpInput = document.querySelector("#jump-search-input");
  const jumpSubmit = document.querySelector("#jump-search-submit");
  const goToSearch = () => {
    const q = jumpInput.value.trim();
    window.location.href = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
  };
  jumpSubmit.addEventListener("click", goToSearch);
  jumpInput.addEventListener("keydown", (event) => { if (event.key === "Enter") goToSearch(); });

  const searchBtn = document.querySelector(".results-block .button--primary");
  if (searchBtn) searchBtn.addEventListener("click", () => { window.location.href = "/search"; });

  document.querySelectorAll("[data-favorite-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFavorite(btn.dataset.favoriteDomain);
      render();
    });
  });

  document.querySelectorAll('[data-domain][data-action="Add"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = getFavorites().find((f) => f.domain === btn.dataset.domain);
      if (!item) return;
      addToCart({ domain: item.domain, price: item.price, cadence: item.cadence });
      pulseCartBadge();
    });
  });

  document.querySelectorAll('[data-domain][data-action="View"], [data-domain][data-action="See options"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `/search?q=${encodeURIComponent(btn.dataset.domain.split(".")[0])}`;
    });
  });
}

render();
initCartDrawer();
initAccountMenu();
