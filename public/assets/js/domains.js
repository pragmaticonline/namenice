import { button, cartIcon, wordmark } from "./components.js";
import {
  getOwnedDomains, getOwnedDomain, formatDate, setAutoRenew, renewOwnedDomain,
  addDnsRecord, removeDnsRecord, updateDnsRecord, getTransferRequests, getTransferRequest,
} from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
let selectedDomain = params.get("d");
let activeTab = "overview";
let editingDnsIndex = null;

function render() {
  const domains = getOwnedDomains();
  const transfers = getTransferRequests().filter((t) => t.status === "pending");
  const current = selectedDomain ? getOwnedDomain(selectedDomain) : null;
  const currentTransfer = !current && selectedDomain ? getTransferRequest(selectedDomain) : null;

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

    ${current ? renderDetail(current) : currentTransfer ? renderTransferDetail(currentTransfer) : renderList(domains, transfers)}
  `;

  bindEvents(current, currentTransfer);
  updateCartBadges();
  updateAuthNav();
}

function renderList(domains, transfers) {
  const hasAny = domains.length > 0 || transfers.length > 0;
  return `
    <section class="search-toolbar">
      <div style="display:flex; align-items:center; justify-content:space-between; gap: var(--space-4); flex-wrap:wrap;">
        <h1 class="search-toolbar__heading" style="margin-bottom:0;">My Domains</h1>
        <a href="/transfer" class="button button--secondary" style="white-space:nowrap;">Transfer a domain</a>
      </div>
    </section>
    <section class="results-block">
      ${!hasAny ? `
        <p class="taken-domain__dates">You don\u2019t have any domains yet.</p>
        <div class="taken-domain__actions">${button({ label: "Find your domain" })}</div>
      ` : `
        <div class="row-group">
          ${transfers.map((t) => `
            <div class="cart-page-item" style="padding: var(--space-5) 0; border-top: var(--border-default); cursor:pointer;" data-open-transfer="${t.domain}">
              <div class="cart-page-item__head">
                <strong>${t.domain}</strong>
                <span class="status-badge status-badge--premium">\u25cf Transfer pending</span>
              </div>
              <p class="taken-domain__dates">Started ${formatDate(t.startedAt)}</p>
              <a class="text-action" href="/domains?d=${encodeURIComponent(t.domain)}">View transfer \u2192</a>
            </div>
          `).join("")}
          ${domains.map((d) => `
            <div class="cart-page-item" style="padding: var(--space-5) 0; border-top: var(--border-default); cursor:pointer;" data-open-domain="${d.domain}">
              <div class="cart-page-item__head">
                <strong>${d.domain}</strong>
                <span class="status-badge status-badge--available">\u25cf Active</span>
              </div>
              <p class="taken-domain__dates">${d.bundleLabel} \u00b7 Expires ${formatDate(d.expiresAt)} \u00b7 Auto-renew ${d.autoRenew ? "On" : "Off"}</p>
              <a class="text-action" href="/domains?d=${encodeURIComponent(d.domain)}">Manage \u2192</a>
            </div>
          `).join("")}
        </div>
      `}
    </section>
  `;
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
      <a class="text-action" href="/domains">\u2190 My Domains</a>
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
      <a class="text-action" href="/domains">\u2190 My Domains</a>
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
    row.addEventListener("click", () => {
      window.location.href = `/domains?d=${encodeURIComponent(row.dataset.openDomain)}`;
    });
  });

  document.querySelectorAll("[data-open-transfer]").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href = `/domains?d=${encodeURIComponent(row.dataset.openTransfer)}`;
    });
  });

  const emptyBtn = document.querySelector(".results-block .button--primary");
  if (!current && !currentTransfer && emptyBtn) {
    emptyBtn.addEventListener("click", () => { window.location.href = "/search"; });
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
