import { button, cartIcon, wordmark } from "./components.js";
import { getOrders, formatDate } from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

function render() {
  const orders = getOrders();

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="/" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="/search" class="site-nav__tab">Search</a>
        <a href="/history" class="site-nav__tab">History</a>
        <a href="/favorites" class="site-nav__tab">Favorites</a>
        <a href="/transfer" class="site-nav__tab site-nav__tab--secondary">Transfer a domain</a>
      </div>
      <div class="site-nav__links">
        <span data-auth-slot></span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    <section class="search-toolbar"><h1 class="search-toolbar__heading">Orders</h1></section>

    <section class="results-block">
      ${orders.length === 0 ? `
        <p class="taken-domain__dates">No orders yet.</p>
        <div class="taken-domain__actions">${button({ label: "Search domains" })}</div>
      ` : `
        <div class="row-group">
          ${orders.map((order) => `
            <div class="cart-page-item" style="padding: var(--space-5) 0; border-top: var(--border-default);">
              <div class="cart-page-item__head">
                <strong>${order.domain}</strong>
                <span>$${order.total.toFixed(2)}</span>
              </div>
              <p class="taken-domain__dates">Order ${order.id} \u00b7 ${formatDate(order.at)} \u00b7 <span class="status-badge status-badge--available">\u25cf Completed</span></p>
              <a class="text-action" href="/domains?d=${encodeURIComponent(order.domain)}">Manage domain \u2192</a>
            </div>
          `).join("")}
        </div>
      `}
    </section>
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function bindEvents() {
  const emptyBtn = document.querySelector(".results-block .button--primary");
  if (emptyBtn) emptyBtn.addEventListener("click", () => { window.location.href = "/search"; });
}

render();
initCartDrawer();
initAccountMenu();
