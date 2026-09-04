import { button, cartIcon, wordmark } from "./components.js";
import {
  getOwnedDomains, getOwnedDomain, formatDate, formatRelativeTime, setAutoRenew, renewOwnedDomain,
  addDnsRecord, removeDnsRecord, updateDnsRecord, getTransferRequests, getTransferRequest,
  getFavorites, getHistory, getOrders, DEMO_USERNAME,
} from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
let selectedDomain = params.get("d");
let activeTab = params.get("tab") || "overview";
let editingDnsIndex = null;
let statusFilter = "all";
let searchFilter = "";

const EXPIRING_SOON_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function isExpiringSoon(d) {
  return d.status === "active" && d.expiresAt - Date.now() < EXPIRING_SOON_MS && d.expiresAt > Date.now();
}

function render() {
  const domains = getOwnedDomains();
  const transfers = getTransferRequests().filter((t) => t.status === "pending");
  const current = selectedDomain ? getOwnedDomain(selectedDomain) : null;
  const currentTransfer = !current && selectedDomain ? getTransferRequest(selectedDomain) : null;

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

    ${current ? renderDetail(current) : currentTransfer ? renderTransferDetail(currentTransfer) : renderList(domains, transfers)}
  `;

  bindEvents(current, currentTransfer);
  updateCartBadges();
  updateAuthNav();
}

function renderList(domains, transfers) {
  const hasAny = domains.length > 0 || transfers.length > 0;
  const expiringCount = domains.filter(isExpiringSoon).length;
  const activeCount = domains.filter((d) => d.status === "active" && !isExpiringSoon(d)).length;

  let rows = [
    ...transfers.map((t) => ({ kind: "transfer", data: t })),
    ...domains.map((d) => ({ kind: "domain", data: d })),
  ];
  if (statusFilter === "active") rows = rows.filter((r) => r.kind === "domain" && r.data.status === "active" && !isExpiringSoon(r.data));
  if (statusFilter === "expiring") rows = rows.filter((r) => r.kind === "domain" && isExpiringSoon(r.data));
  if (statusFilter === "pending") rows = rows.filter((r) => r.kind === "transfer");
  if (searchFilter.trim()) rows = rows.filter((r) => r.data.domain.toLowerCase().includes(searchFilter.trim().toLowerCase()));

  const recent = buildRecentActivity();

  return `
    <div class="dash-layout">
      <section>
        <h1 class="search-toolbar__heading" style="margin-top: var(--space-8);">${hasAny ? "Welcome back" : "Welcome"}, ${(typeof window !== "undefined" && window.__NAMENICE_USER__) ? window.__NAMENICE_USER__ : "there"}.</h1>
        <p class="taken-domain__dates">Manage your domains, renewals, and settings all in one place.</p>

        <div class="dash-search">
          <input type="text" id="dash-search-input" placeholder="Search your domains" aria-label="Search your domains" value="${searchFilter}" />
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M18 18l-3.8-3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </div>

        ${!hasAny ? `
          <div class="dash-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="margin:0 auto var(--space-4);"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke="currentColor" stroke-width="1.2"/></svg>
            <p>You don\u2019t have any domains yet. Search for a name, favorite one you like, or transfer a domain you already own.</p>
            <div class="taken-domain__actions" style="display:flex; gap: var(--space-4); justify-content:center;">
              ${button({ label: "Search domains" })}
              <a href="transfer.html" class="button button--secondary">Transfer a domain</a>
            </div>
          </div>
        ` : `
          <div class="dash-filters">
            <button type="button" data-filter="all" class="${statusFilter === "all" ? "is-active" : ""}">All domains (${domains.length + transfers.length})</button>
            <button type="button" data-filter="active" class="${statusFilter === "active" ? "is-active" : ""}">Active (${activeCount})</button>
            <button type="button" data-filter="expiring" class="${statusFilter === "expiring" ? "is-active" : ""}">Expiring soon (${expiringCount})</button>
            <button type="button" data-filter="pending" class="${statusFilter === "pending" ? "is-active" : ""}">Transfer pending (${transfers.length})</button>
          </div>
          ${rows.length === 0 ? `<p class="taken-domain__dates" style="padding: var(--space-6) 0;">No domains match this filter.</p>` : `
            <div>
              ${rows.map((r) => r.kind === "transfer" ? renderTransferRow(r.data) : renderDomainRow(r.data)).join("")}
            </div>
            <p class="taken-domain__dates" style="margin-top:var(--space-5);">Showing 1\u2013${rows.length} of ${rows.length} domain${rows.length === 1 ? "" : "s"}</p>
          `}
        `}
      </section>

      <aside>
        <div class="dash-sidebar-card">
          <h3>Account summary</h3>
          ${hasAny ? `
            <div class="dash-summary-row"><span>Domains</span><strong>${domains.length}</strong></div>
            <div class="dash-summary-row"><span>Expiring soon</span><strong style="color:${expiringCount > 0 ? "var(--color-status-warning)" : "inherit"};">${expiringCount}</strong></div>
            <div class="dash-summary-row"><span>Transfer pending</span><strong>${transfers.length}</strong></div>
          ` : `
            <div class="dash-summary-row"><span>Domains</span><strong>0</strong></div>
            <div class="dash-summary-row"><span>Favorites</span><strong>${getFavorites().length}</strong></div>
            <div class="dash-summary-row"><span>Searches</span><strong>${getHistory().length}</strong></div>
          `}
          <a href="transfer.html" class="button button--primary" style="display:flex;">Transfer a domain</a>
          ${hasAny ? `<a href="#" class="text-action" id="browse-domains-link">Browse domains \u2192</a>` : ""}
        </div>

        <div class="dash-sidebar-card">
          <h3>Quick actions</h3>
          ${hasAny ? `
            <a href="domains.html?d=${encodeURIComponent(domains[0]?.domain || "")}&tab=renewal" class="dash-quick-action"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> Renew a domain</a>
            <a href="domains.html?d=${encodeURIComponent(domains[0]?.domain || "")}&tab=renewal" class="dash-quick-action"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M7 10.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> Enable auto-renew</a>
            <a href="domains.html?d=${encodeURIComponent(domains[0]?.domain || "")}&tab=dns" class="dash-quick-action"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 8h14" stroke="currentColor" stroke-width="1.4"/></svg> Manage DNS</a>
            <a href="account.html" class="dash-quick-action"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> Update contact info</a>
          ` : `<p class="taken-domain__dates" style="margin:0;">Quick actions show up here once you have a domain to manage.</p>`}
        </div>

        <div class="dash-sidebar-card">
          <h3>Recent activity</h3>
          ${recent.length === 0 ? `<p class="taken-domain__dates" style="margin:0;">No activity yet.</p>` : recent.map((a) => `
            <div class="dash-activity-item"><p>${a.text}</p><span>${formatRelativeTime(a.at)}</span></div>
          `).join("")}
        </div>
      </aside>
    </div>
  `;
}

function renderDomainRow(d) {
  const expiring = isExpiringSoon(d);
  return `
    <div class="dash-row" data-open-domain="${d.domain}" style="cursor:pointer;">
      <span class="dash-row__icon ${expiring ? "dash-row__icon--warning" : "dash-row__icon--active"}">${expiring
        ? `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 3l8 14H2l8-14z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 8v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r=".8" fill="currentColor"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/></svg>`}</span>
      <div class="dash-row__name">
        <div>
          <strong>${d.domain}</strong>
          <span class="status-badge status-badge--${expiring ? "premium" : "available"}" style="margin-left:8px;">\u25cf ${expiring ? "Expiring soon" : "Active"}</span>
          <p class="dash-row__meta">Renews ${formatDate(d.expiresAt)} \u00b7 Auto-renew is ${d.autoRenew ? "On" : "Off"}</p>
        </div>
      </div>
      <div class="dash-row__col"><p>Privacy</p><p style="color:${d.privacy ? "var(--color-status-success)" : "inherit"};">${d.privacy ? "\u2713 Protected" : "Not enabled"}</p></div>
      <div class="dash-row__col"><p>DNS</p><p>namenice DNS</p></div>
      <div class="dash-row__actions">
        <a href="domains.html?d=${encodeURIComponent(d.domain)}" class="button button--secondary" style="height:36px; padding:0 16px;">Manage</a>
      </div>
    </div>
  `;
}

function renderTransferRow(t) {
  return `
    <div class="dash-row" data-open-transfer="${t.domain}" style="cursor:pointer;">
      <span class="dash-row__icon dash-row__icon--pending"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M14 3v3h-3M6 17v-3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <div class="dash-row__name">
        <div>
          <strong>${t.domain}</strong>
          <span class="status-badge status-badge--premium" style="margin-left:8px;">\u25cf Transfer pending</span>
          <p class="dash-row__meta">Transfer started ${formatDate(t.startedAt)} \u00b7 Estimated completion 5\u20137 days</p>
        </div>
      </div>
      <div class="dash-row__col"><p>From</p><p>Previous registrar</p></div>
      <div class="dash-row__col"><p>Status</p><p>Awaiting authorization</p></div>
      <div class="dash-row__actions">
        <a href="domains.html?d=${encodeURIComponent(t.domain)}" class="button button--secondary" style="height:36px; padding:0 16px;">View transfer</a>
      </div>
    </div>
  `;
}

function buildRecentActivity() {
  const orders = getOrders().map((o) => ({ text: `Registered ${o.domain}`, at: o.at }));
  const transfers = getTransferRequests().map((t) => ({ text: `Transfer started for ${t.domain}`, at: t.startedAt }));
  return [...orders, ...transfers].sort((a, b) => b.at - a.at).slice(0, 5);
}

function renderDetail(domain) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "dns", label: "DNS" },
    { id: "renewal", label: "Renewal" },
    { id: "privacy", label: "Privacy" },
    { id: "transfer", label: "Transfer" },
  ];
  return `
    <section class="search-toolbar">
      <a class="text-action" href="domains.html">\u2190 My Domains</a>
      <h1 class="search-toolbar__heading" style="margin-top: var(--space-3);">${domain.domain}</h1>
      <div style="margin: var(--space-2) 0 var(--space-4);"><span class="status-badge status-badge--available">\u25cf Active</span></div>
      <div class="checkout-steps">
        ${tabs.map((t) => `<button type="button" class="checkout-steps__item checkout-steps__item--tab${activeTab === t.id ? " is-active" : ""}" data-tab="${t.id}" aria-pressed="${activeTab === t.id}">${t.label}</button>`).join("<span class=\"checkout-steps__sep\">\u2022</span>")}
      </div>
    </section>
    <section class="results-block">
      ${activeTab === "overview" ? renderOverviewTab(domain) : ""}
      ${activeTab === "dns" ? renderDnsTab(domain) : ""}
      ${activeTab === "renewal" ? renderRenewalTab(domain) : ""}
      ${activeTab === "privacy" ? renderPrivacyTab(domain) : ""}
      ${activeTab === "transfer" ? renderTransferTab(domain) : ""}
    </section>
  `;
}

function renderOverviewTab(d) {
  return `
    <div class="price-decision__row" style="border-top:0;">
      <div><p class="price-decision__label">Registered</p><p class="price-decision__amount" style="font-size:18px;">${formatDate(d.registeredAt)}</p></div>
      <div><p class="price-decision__label">Expires</p><p class="price-decision__amount" style="font-size:18px;">${formatDate(d.expiresAt)}</p></div>
    </div>
    <div class="price-decision__row">
      <div><p class="price-decision__label">Renewal price</p><p class="price-decision__amount" style="font-size:18px;">$${d.renewalPrice.toFixed(2)}<span>/ year</span></p></div>
      <div><p class="price-decision__label">Auto-renew</p><p class="price-decision__amount" style="font-size:18px;">${d.autoRenew ? "On" : "Off"}</p></div>
    </div>
    <p class="taken-domain__dates" style="margin-top: var(--space-5);">Package: ${d.bundleLabel}</p>
  `;
}

function renderDnsTab(d) {
  return `
    <p class="taken-domain__dates">Example DNS records for this domain. This is a mock \u2014 no real DNS is changed.</p>
    <div class="compare-table-wrap" style="margin-top: var(--space-5);">
      <table class="compare-table">
        <thead><tr><th>Type</th><th>Name</th><th>Value</th><th>TTL</th><th></th></tr></thead>
        <tbody>
          ${d.dns.map((r, i) => editingDnsIndex === i ? renderDnsEditRow(r, i) : `<tr>
            <td class="compare-table__domain">${r.type}</td>
            <td>${r.name}</td>
            <td>${r.value}</td>
            <td>${r.ttl}</td>
            <td>
              <button type="button" class="text-action" data-edit-dns="${i}">Edit</button>
              <button type="button" class="text-action" data-remove-dns="${i}" style="margin-left: var(--space-3);">Delete</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div style="margin-top: var(--space-6);">${button({ label: "Add record", kind: "secondary" })}</div>
    <p class="taken-domain__dates" style="margin-top: var(--space-8);">Nameservers</p>
    <p class="taken-domain__dates">ns1.namenice.net \u00b7 ns2.namenice.net</p>
  `;
}

function renderDnsEditRow(r, i) {
  return `<tr class="dns-edit-row" data-dns-edit-row="${i}">
    <td><input class="field" style="height:32px; padding:0 8px; font-size:13px;" value="${r.type}" data-dns-field="type" /></td>
    <td><input class="field" style="height:32px; padding:0 8px; font-size:13px;" value="${r.name}" data-dns-field="name" /></td>
    <td><input class="field" style="height:32px; padding:0 8px; font-size:13px;" value="${r.value}" data-dns-field="value" /></td>
    <td><input class="field" style="height:32px; padding:0 8px; font-size:13px;" value="${r.ttl}" data-dns-field="ttl" /></td>
    <td>
      <button type="button" class="text-action" data-save-dns="${i}">Save</button>
      <button type="button" class="text-action" data-cancel-dns style="margin-left: var(--space-3);">Cancel</button>
    </td>
  </tr>`;
}

function renderRenewalTab(d) {
  return `
    <p class="taken-domain__dates">Expires ${formatDate(d.expiresAt)}</p>
    <div class="price-decision__row" style="border-top:0;">
      <div>
        <p class="price-decision__label">Auto-renew</p>
        <label class="cart-drawer__bundle-option" style="max-width:260px;">
          <input type="checkbox" id="auto-renew-toggle" ${d.autoRenew ? "checked" : ""} />
          <span class="cart-drawer__bundle-text"><span class="cart-drawer__bundle-label">${d.autoRenew ? "On" : "Off"}</span><span class="cart-drawer__bundle-desc">Your domain will renew automatically before it expires.</span></span>
        </label>
      </div>
    </div>
    <p class="taken-domain__dates" style="margin-top: var(--space-6);">Renewal price: $${d.renewalPrice.toFixed(2)} / year \u2014 confirmed before you're charged, never a surprise.</p>
    <div style="margin-top: var(--space-5);">${button({ label: "Renew for 1 year" })}</div>
  `;
}

function renderPrivacyTab(d) {
  return `
    <p class="price-decision__label">Domain privacy</p>
    <p class="price-decision__amount" style="font-size:20px;">${d.privacy ? "Protected" : "Not enabled"}</p>
    <p class="taken-domain__dates" style="margin-top: var(--space-3);">${d.privacy ? "Your registration contact details are hidden from public WHOIS lookups. Already included with this domain." : "Your registration contact details are publicly visible."}</p>
  `;
}

function renderTransferTab(d) {
  return `
    <p class="taken-domain__dates">Transfer ${d.domain} to another registrar.</p>
    <div class="price-decision__row" style="border-top:0;">
      <div><p class="price-decision__label">Domain lock</p><p class="price-decision__amount" style="font-size:18px;">On</p></div>
    </div>
    <p class="taken-domain__dates" style="margin-top: var(--space-5);">Unlock the domain and request an authorization code to begin a transfer out. This is prototype UX only \u2014 no real transfer is processed.</p>
    <div style="margin-top: var(--space-5);">${button({ label: "Get authorization code", kind: "secondary" })}</div>
  `;
}

function renderTransferDetail(t) {
  const timelineSteps = ["Transfer started", "Authorization verified", "Current registrar processes transfer", "Transfer completed"];
  return `
    <section class="search-toolbar">
      <a class="text-action" href="domains.html">\u2190 My Domains</a>
      <h1 class="search-toolbar__heading" style="margin-top: var(--space-3);">${t.domain}</h1>
      <div style="margin: var(--space-2) 0 var(--space-4);"><span class="status-badge status-badge--premium">\u25cf Transfer pending</span></div>
    </section>
    <section class="results-block">
      <p class="results-block__label">Transfer status</p>
      <p class="price-decision__amount" style="font-size:18px;">Transfer pending</p>
      <p class="taken-domain__dates" style="margin-top: var(--space-2);">Started ${formatDate(t.startedAt)} \u00b7 Transfer ID ${t.id}</p>

      <p class="results-block__label" style="margin-top: var(--space-8);">Timeline</p>
      <div class="transfer-timeline">
        ${timelineSteps.map((label, i) => `
          <div class="transfer-timeline__step${i === 0 ? " is-done" : ""}">
            <span class="transfer-timeline__dot" aria-hidden="true">${i === 0 ? "\u2713" : ""}</span>
            <span>${label}</span>
          </div>
        `).join("")}
      </div>
      <p class="taken-domain__dates" style="margin-top: var(--space-6);">This is prototype UX \u2014 the timeline doesn\u2019t update in real time.</p>
    </section>
  `;
}

function bindEvents(current, currentTransfer) {
  document.querySelectorAll("[data-open-domain]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) return; // let the Manage link handle its own navigation
      window.location.href = `domains.html?d=${encodeURIComponent(row.dataset.openDomain)}`;
    });
  });

  document.querySelectorAll("[data-open-transfer]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      window.location.href = `domains.html?d=${encodeURIComponent(row.dataset.openTransfer)}`;
    });
  });

  const emptyBtn = document.querySelector(".dash-empty .button--primary");
  if (!current && !currentTransfer && emptyBtn) {
    emptyBtn.addEventListener("click", () => { window.location.href = "search.html"; });
  }

  const searchInput = document.querySelector("#dash-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      searchFilter = event.target.value;
      render();
      document.querySelector("#dash-search-input").focus();
      const val = document.querySelector("#dash-search-input").value;
      document.querySelector("#dash-search-input").setSelectionRange(val.length, val.length);
    });
  }

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      statusFilter = btn.dataset.filter;
      render();
    });
  });

  const browseLink = document.querySelector("#browse-domains-link");
  if (browseLink) {
    browseLink.addEventListener("click", (event) => {
      event.preventDefault();
      statusFilter = "all";
      render();
    });
  }

  if (!current) return;

  document.querySelectorAll("[data-tab]").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      activeTab = tabEl.dataset.tab;
      editingDnsIndex = null;
      render();
    });
  });

  const autoRenewToggle = document.querySelector("#auto-renew-toggle");
  if (autoRenewToggle) {
    autoRenewToggle.addEventListener("change", () => {
      setAutoRenew(current.domain, autoRenewToggle.checked);
      render();
    });
  }

  document.querySelectorAll("[data-remove-dns]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeDnsRecord(current.domain, Number(btn.dataset.removeDns));
      if (editingDnsIndex === Number(btn.dataset.removeDns)) editingDnsIndex = null;
      render();
    });
  });

  document.querySelectorAll("[data-edit-dns]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingDnsIndex = Number(btn.dataset.editDns);
      render();
    });
  });

  document.querySelectorAll("[data-cancel-dns]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingDnsIndex = null;
      render();
    });
  });

  document.querySelectorAll("[data-save-dns]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.saveDns);
      const row = document.querySelector(`[data-dns-edit-row="${index}"]`);
      const record = {};
      row.querySelectorAll("[data-dns-field]").forEach((input) => {
        record[input.dataset.dnsField] = input.value.trim();
      });
      updateDnsRecord(current.domain, index, record);
      editingDnsIndex = null;
      render();
    });
  });

  if (activeTab === "renewal") {
    const renewBtn = document.querySelector(".results-block .button--primary");
    if (renewBtn) renewBtn.addEventListener("click", () => {
      renewOwnedDomain(current.domain, 1);
      render();
    });
  }

  if (activeTab === "dns") {
    const addBtn = document.querySelector(".results-block .button--secondary");
    if (addBtn) addBtn.addEventListener("click", () => {
      addDnsRecord(current.domain, { type: "TXT", name: "@", value: "v=spf1 ~all", ttl: "1 hour" });
      render();
    });
  }
}

render();
initCartDrawer();
initAccountMenu();
