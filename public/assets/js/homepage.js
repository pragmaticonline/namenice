import { button, cartIcon, domainSearch, wordmark } from "./components.js";
import { domainSearchMock } from "./mocks/domain-search-mock.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";
import { initTldDropdown } from "./tld-dropdown.js";

const app = document.querySelector("#app");
let searchState = "initial";
let query = domainSearchMock.initialQuery;
let tld = ".net";

const techCapabilities = [
  { title: "Every record type", body: "A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, ALIAS \u2014 with TTLs from 60 seconds to a full day." },
  { title: "Zone tools", body: "Import a BIND zone file, bulk-edit records, or set up URL forwarding with 301 or 302 redirects." },
  { title: "Domain security", body: "DNSSEC, vanity nameservers, WHOIS privacy by default, and lock or unlock a domain when it matters." },
  { title: "Team access", body: "Owner, admin, billing, and viewer roles, with 7-day invite links and a 90-day audit trail." },
  { title: "Developer access", body: "API keys, webhooks, and a balance ledger \u2014 Stripe is only the processor, not the source of truth." },
  { title: "Auto-renewal", body: "Renew straight from your balance so an important name never lapses by accident." },
];

const valueProps = [
  { title: "Own it, plainly", body: "The domain is registered to you, in your account, with a straightforward path to move or transfer it whenever you need to." },
  { title: "Pricing you can see", body: "The price you check is the price you pay. Renewal costs are shown up front, not buried until the year it renews." },
  { title: "DNS that doesn\u2019t fight you", body: "Add a record, save it, done. No hunting through nested menus to point a domain at your site." },
  { title: "Control over what matters", body: "Share access with a team without sharing the whole account \u2014 owner, admin, billing, and viewer each see only what they need." },
  { title: "Renewal, handled simply", body: "Turn on auto-renew and stop thinking about it, or manage it manually if you\u2019d rather decide each year yourself." },
];

function buildResultForTld(base) {
  const name = base.domain.split(".")[0];
  return { ...base, domain: `${name}${tld}` };
}

function render() {
  const result = searchState === "unavailable" ? buildResultForTld(domainSearchMock.unavailable)
    : searchState === "premium" ? buildResultForTld(domainSearchMock.premium)
      : buildResultForTld(domainSearchMock.available);
  const suggestions = searchState === "unavailable" ? domainSearchMock.suggestions : [];

  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="#" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="search.html" class="site-nav__tab">Search</a>
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

    <header class="hero">
      <div class="hero__diagonal" aria-hidden="true"></div>
      <div class="hero__grid">
        <div class="hero__copy">
          <p class="hero__eyebrow">namenice \u00b7 domains</p>
          <h1 class="hero__headline">Find a name<br />worth <mark class="hero__accent">owning</mark>.</h1>
          <p class="hero__subhead">Search. Check. Register. Your next domain in minutes.</p>
          <div class="hero__extensions" aria-hidden="true">
            <p class="hero__extensions-label">Popular extensions</p>
            <div class="hero__extensions-grid">
              <span>.net</span>
              <span>.com</span>
              <span>.io</span>
              <span>.co</span>
              <span>.org</span>
            </div>
          </div>
        </div>
        <div class="hero__mark" aria-hidden="true">
          <div class="hero__popular">
            <p class="hero__popular-label">Popular extensions</p>
            <div class="hero__popular-list">
              <span>.net</span>
              <span>.com</span>
              <span>.io</span>
              <span>.co</span>
              <span>.org</span>
            </div>
          </div>
        </div>
      </div>
    </header>
    <div class="hero-search-overlap">
      ${domainSearch({ query, state: searchState, result, suggestions, tld })}
    </div>
    <p class="taken-domain__dates" style="text-align:center; margin: var(--space-4) 0 var(--space-8);">Already own a domain? <a class="text-action" href="transfer.html">Transfer it to namenice \u2192</a></p>

    <section class="section section--after-hero">
      <p class="section__eyebrow">Why namenice</p>
      <h2 class="section__heading">A domain is a small commitment. It shouldn\u2019t feel like a big risk.</h2>
      <div class="value-list">
        ${valueProps.map((item) => `<div class="value-row"><h3>${item.title}</h3><p>${item.body}</p></div>`).join("")}
      </div>
    </section>

    <section class="section">
      <p class="section__eyebrow">Pricing</p>
      <h2 class="section__heading">Know what you\u2019ll pay.</h2>
      <div class="price-decision">
        <div class="price-decision__domain">
          <span class="domain-result__selected-marker" aria-hidden="true">&check;</span>
          <span class="price-decision__name">${domainSearchMock.available.domain}</span>
        </div>
        <div class="price-decision__row">
          <div>
            <p class="price-decision__label">Registration</p>
            <p class="price-decision__amount">${domainSearchMock.available.price}<span>${domainSearchMock.available.cadence}</span></p>
          </div>
          <div>
            <p class="price-decision__label">Renewal</p>
            <p class="price-decision__amount price-decision__amount--muted">${domainSearchMock.available.renewalPrice}<span>${domainSearchMock.available.renewalCadence}</span></p>
          </div>
        </div>
        <p class="price-decision__terms">Price includes WHOIS privacy. The renewal price shown here is confirmed again before you\u2019re ever charged \u2014 not adjusted after the fact.</p>
        <div class="price-decision__actions">
          ${button({ label: "Continue" })}
          <button class="text-action" type="button">See domain details</button>
        </div>
      </div>
    </section>

    <section class="section section--dark">
      <div class="tech-panel">
        <div>
          <p class="section__eyebrow">Technical capability</p>
          <h2 class="section__heading" style="margin-bottom: var(--space-4)">Built for people who actually manage domains, not just buy them once.</h2>
          <p class="tech-panel__lede">Everything below is available from day one \u2014 no upgrade tier required to reach it.</p>
        </div>
        <div class="tech-grid">
          ${techCapabilities.map((item) => `<div class="tech-item"><h4>${item.title}</h4><p>${item.body}</p></div>`).join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="management-preview">
        <div>
          <p class="section__eyebrow">After you buy</p>
          <h2 class="section__heading" style="margin-bottom: var(--space-4)">Managing a domain stays this simple.</h2>
          <p class="management-preview__lede">One place to see status, adjust DNS, and handle renewal \u2014 no separate dashboard to learn.</p>
        </div>
        <div class="management-panel">
          <div class="management-panel__header">
            <div>
              <h3>${domainSearchMock.available.domain}</h3>
              <p style="margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: 13px;">Registered \u00b7 renews 14 Aug 2027 \u00b7 auto-renew on</p>
            </div>
          </div>
          <div class="management-actions">
            ${button({ label: "Manage DNS", kind: "secondary" })}
            ${button({ label: "Renewal settings", kind: "secondary" })}
          </div>
        </div>
      </div>
    </section>

    <section class="final-cta">
      <h2 class="final-cta__headline">You found the name.<br />Time to own it.</h2>
      ${button({ label: "Create your account" })}
    </section>

    <footer class="site-footer">
      <a href="#" class="wordmark">${wordmark()}</a>
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

function bindEvents() {
  const input = document.querySelector("#domain-search-input");
  const submit = document.querySelector(".signature-search__submit");
  input.addEventListener("input", (event) => { query = event.target.value; });
  input.addEventListener("focus", () => document.querySelector(".signature-search").dataset.searchState = "focus");
  submit.addEventListener("click", () => {
    searchState = "searching";
    render();
    window.setTimeout(() => { searchState = "available"; render(); }, 650);
  });
  document.querySelector(".final-cta .button--primary").addEventListener("click", () => {
    window.location.href = "signup.html";
  });
}

render();
initCartDrawer();
initAccountMenu();
initTldDropdown((selectedTld) => {
  tld = selectedTld;
  searchState = "initial";
  render();
});
