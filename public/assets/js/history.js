import { button, cartIcon, domainResultRow, wordmark } from "./components.js";
import { clearHistory, formatRelativeTime, getHistory, isFavorited, toggleFavorite, addToCart } from "./state.js";
import { initCartDrawer, pulseCartBadge, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

function render() {
  const history = getHistory();

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="search.html" class="site-nav__tab">Search</a>
        <a href="history.html" class="site-nav__tab is-active">History</a>
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
      <p class="results-block__label">History${history.length > 0 ? ` (${history.length})` : ""}</p>
      ${history.length === 0 ? `
        <p class="taken-domain__dates">No searches yet. Your recent searches will show up here.</p>
        <div class="taken-domain__actions">${button({ label: "Search domains" })}</div>
      ` : `
        <div class="row-group">
          ${history.map((entry) => renderHistoryRow(entry)).join("")}
        </div>
        <div class="taken-domain__actions">
          <button class="text-action" id="clear-history" type="button">Clear history</button>
        </div>
      `}
    </section>
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function actionForStatus(status) {
  if (status === "premium") return "View";
  if (status === "unavailable") return "See options";
  return "Add";
}

function renderHistoryRow(entry) {
  if (entry.result) {
    return domainResultRow(entry.result, {
      action: actionForStatus(entry.result.status),
      favorited: isFavorited(entry.result.domain),
    });
  }
  return `
    <div class="taken-domain" style="padding: var(--space-5) 0; border-top: var(--border-default);">
      <div class="taken-domain__header">
        <strong><a href="search.html?q=${encodeURIComponent(entry.query)}" style="color:inherit;text-decoration:none;">${entry.query}</a></strong>
        <span style="color:var(--color-text-secondary);font-size:13px;">${formatRelativeTime(entry.at)}</span>
      </div>
    </div>
  `;
}

function bindEvents() {
  const jumpInput = document.querySelector("#jump-search-input");
  const jumpSubmit = document.querySelector("#jump-search-submit");
  const goToSearch = () => {
    const q = jumpInput.value.trim();
    window.location.href = q ? `search.html?q=${encodeURIComponent(q)}` : "search.html";
  };
  jumpSubmit.addEventListener("click", goToSearch);
  jumpInput.addEventListener("keydown", (event) => { if (event.key === "Enter") goToSearch(); });

  const searchBtn = document.querySelector(".results-block .button--primary");
  if (searchBtn) searchBtn.addEventListener("click", () => { window.location.href = "search.html"; });

  const clearBtn = document.querySelector("#clear-history");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    clearHistory();
    render();
  });

  document.querySelectorAll("[data-favorite-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = getHistory().find((h) => h.result && h.result.domain === btn.dataset.favoriteDomain);
      const result = entry ? entry.result : { domain: btn.dataset.favoriteDomain };
      toggleFavorite(result);
      render();
    });
  });

  document.querySelectorAll('[data-domain][data-action="Add"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = getHistory().find((h) => h.result && h.result.domain === btn.dataset.domain);
      if (!entry) return;
      addToCart({ domain: entry.result.domain, price: entry.result.price, cadence: entry.result.cadence });
      pulseCartBadge();
    });
  });

  document.querySelectorAll('[data-domain][data-action="View"], [data-domain][data-action="See options"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `search.html?q=${encodeURIComponent(btn.dataset.domain.split(".")[0])}`;
    });
  });
}

render();
initCartDrawer();
initAccountMenu();
