import { button, cartIcon, wordmark } from "./components.js";
import { getOrders, getTransferRequests, formatDate } from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const PAGE_SIZE = 10;

let typeFilter = "all";
let currentPage = 1;
let selectedOrderId = null;

function buildOrderRows() {
  const purchases = getOrders().map((o) => ({
    id: o.id, domain: o.domain, type: "domain", typeLabel: "Domain registration",
    at: o.at, total: o.total, status: "paid",
  }));
  const transfers = getTransferRequests().map((t) => ({
    id: t.id, domain: t.domain, type: "transfer", typeLabel: "Domain transfer",
    at: t.startedAt, total: t.price, status: "paid",
  }));
  return [...purchases, ...transfers].sort((a, b) => b.at - a.at);
}

function render() {
  const all = buildOrderRows();
  const filtered = typeFilter === "all" ? all : all.filter((o) => o.type === typeFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = selectedOrderId ? all.find((o) => o.id === selectedOrderId) : null;

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="search.html" class="site-nav__tab">Search</a>
        <a href="history.html" class="site-nav__tab">History</a>
        <a href="favorites.html" class="site-nav__tab">Favorites</a>
        <a href="transfer.html" class="site-nav__tab site-nav__tab--secondary">Transfer a domain</a>
      </div>
      <div class="site-nav__links">
        <span data-auth-slot></span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Orders</h1>
      <p class="taken-domain__dates">Your purchases and payment history.</p>
    </section>

    ${all.length === 0 ? renderEmpty() : `
      <div class="orders-layout${selected ? " has-detail" : ""}">
        <section class="results-block orders-main">
          <div class="dash-filters">
            <button type="button" data-order-filter="all" class="${typeFilter === "all" ? "is-active" : ""}">All</button>
            <button type="button" data-order-filter="domain" class="${typeFilter === "domain" ? "is-active" : ""}">Domains</button>
            <button type="button" data-order-filter="transfer" class="${typeFilter === "transfer" ? "is-active" : ""}">Transfers</button>
            <button type="button" data-order-filter="other" class="${typeFilter === "other" ? "is-active" : ""}">Other</button>
          </div>

          ${filtered.length === 0 ? `<p class="taken-domain__dates" style="padding: var(--space-6) 0;">No orders in this category.</p>` : `
            <div class="orders-table">
              <div class="orders-table__head">
                <span>Order</span><span>Item</span><span>Date</span><span>Status</span><span>Total</span><span></span>
              </div>
              ${pageItems.map((o) => `
                <div class="orders-table__row${selectedOrderId === o.id ? " is-selected" : ""}">
                  <span class="orders-table__id">#${o.id}</span>
                  <span>
                    <strong>${o.domain}</strong>
                    <span class="orders-table__item-meta">${o.typeLabel} \u00b7 1 year</span>
                  </span>
                  <span>${formatDate(o.at)}</span>
                  <span><span class="status-badge status-badge--available">\u25cf Paid</span></span>
                  <span class="orders-table__total">$${o.total.toFixed(2)}</span>
                  <button type="button" class="text-action" data-view-order="${o.id}">View details \u2192</button>
                </div>
              `).join("")}
            </div>
            ${totalPages > 1 ? `
              <div class="orders-pagination">
                <button type="button" data-page="prev" aria-label="Previous page" ${currentPage === 1 ? "disabled" : ""}>\u2039</button>
                ${Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => `
                  <button type="button" data-page="${p}" class="${p === currentPage ? "is-active" : ""}">${p}</button>
                `).join("")}
                <button type="button" data-page="next" aria-label="Next page" ${currentPage === totalPages ? "disabled" : ""}>\u203a</button>
              </div>
            ` : ""}
          `}
        </section>

        ${selected ? renderDetailPanel(selected) : ""}
      </div>
    `}

    <footer class="site-footer">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-footer__text">
        <p>Domains, without the noise. \u00b7 <a href="transfer.html" style="color:inherit;">Transfer a domain</a></p>
        <p class="site-footer__copyright">\u00a9 2026 namenice. All rights reserved.</p>
      </div>
    </footer>
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function renderEmpty() {
  return `
    <section class="results-block">
      <div class="dash-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="margin:0 auto var(--space-4);"><path d="M4 8l8 5 8-5M4 8v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8M4 8l3-4h10l3 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p style="font-size:16px; font-weight:700; color:var(--color-text-primary);">No orders yet</p>
        <p>Your purchases will appear here after you register a domain.</p>
        <div class="taken-domain__actions">${button({ label: "Find a domain" })}</div>
      </div>
    </section>
  `;
}

function renderDetailPanel(order) {
  return `
    <aside class="orders-detail">
      <div class="orders-detail__header">
        <p class="results-block__label" style="margin:0;">Order #${order.id}</p>
        <button type="button" class="orders-detail__close" data-close-detail aria-label="Close">\u2715</button>
      </div>
      <p class="orders-detail__status"><span class="orders-detail__check">\u2713</span> <span class="status-badge status-badge--available">Paid</span> \u00b7 ${formatDate(order.at)}</p>

      <p class="results-block__label" style="margin-top: var(--space-6);">Order details</p>
      <div class="orders-detail__line">
        <div><strong>${order.domain}</strong><p class="taken-domain__dates" style="margin:2px 0 0;">${order.typeLabel} \u00b7 1 year</p></div>
        <span>$${order.total.toFixed(2)}</span>
      </div>
      <div class="orders-detail__total">
        <span>Total</span><strong>$${order.total.toFixed(2)}</strong>
      </div>

      <p class="results-block__label" style="margin-top: var(--space-6);">Payment</p>
      <div class="orders-detail__payment">
        <span class="payment-card-row__brand">Stripe</span>
        <div><strong>Paid via Stripe</strong><p class="taken-domain__dates" style="margin:2px 0 0;">${formatDate(order.at)}</p></div>
      </div>
      <button type="button" class="text-action" data-manage-stripe style="margin-top: var(--space-2);">Manage billing in Stripe \u2192</button>
      <p class="taken-domain__dates" id="stripe-note" style="display:none; margin-top: var(--space-2);">This would open Stripe\u2019s billing portal in a real integration.</p>

      <p class="results-block__label" style="margin-top: var(--space-6);">Receipt</p>
      <button type="button" class="text-action" data-download-receipt style="display:flex; align-items:center; gap: var(--space-2);">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        Download receipt (PDF)
      </button>
      <p class="taken-domain__dates" id="receipt-note" style="display:none; margin-top: var(--space-2);">This is a prototype \u2014 receipt download isn\u2019t available yet.</p>
    </aside>
  `;
}

function bindEvents() {
  const emptyBtn = document.querySelector(".dash-empty .button--primary");
  if (emptyBtn) emptyBtn.addEventListener("click", () => { window.location.href = "search.html"; });

  document.querySelectorAll("[data-order-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      typeFilter = btn.dataset.orderFilter;
      currentPage = 1;
      selectedOrderId = null;
      render();
    });
  });

  document.querySelectorAll("[data-view-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedOrderId = btn.dataset.viewOrder;
      render();
    });
  });

  const closeBtn = document.querySelector("[data-close-detail]");
  if (closeBtn) closeBtn.addEventListener("click", () => { selectedOrderId = null; render(); });

  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.page === "prev") currentPage -= 1;
      else if (btn.dataset.page === "next") currentPage += 1;
      else currentPage = Number(btn.dataset.page);
      render();
    });
  });

  const receiptBtn = document.querySelector("[data-download-receipt]");
  if (receiptBtn) receiptBtn.addEventListener("click", () => {
    document.querySelector("#receipt-note").style.display = "block";
  });

  const stripeBtn = document.querySelector("[data-manage-stripe]");
  if (stripeBtn) stripeBtn.addEventListener("click", () => {
    document.querySelector("#stripe-note").style.display = "block";
  });
}

render();
initCartDrawer();
initAccountMenu();
