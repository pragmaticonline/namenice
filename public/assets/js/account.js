import { button, cartIcon, wordmark } from "./components.js";
import { DEMO_USERNAME, isSignedIn } from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

function render() {
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

    <section class="search-toolbar"><h1 class="search-toolbar__heading">Account settings</h1></section>

    <section class="results-block">
      ${isSignedIn() ? `
        <p class="price-decision__label">Username</p>
        <p class="price-decision__amount" style="font-size:18px;">${DEMO_USERNAME}</p>
        <p class="taken-domain__dates" style="margin-top: var(--space-5);">This is a presentation demo \u2014 there\u2019s no real account, so there\u2019s nothing else to change here yet.</p>
        <div class="taken-domain__actions"><button type="button" class="button button--secondary" data-sign-out>Sign out</button></div>
      ` : `
        <p class="taken-domain__dates">You\u2019re not signed in.</p>
        <div class="taken-domain__actions">${button({ label: "Sign in" })}</div>
      `}
    </section>
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function bindEvents() {
  const signOutBtn = document.querySelector("[data-sign-out]");
  if (signOutBtn) signOutBtn.addEventListener("click", () => window.setTimeout(render, 0));

  const signInBtn = document.querySelector(".results-block .button--primary");
  if (signInBtn && !isSignedIn()) signInBtn.addEventListener("click", () => { window.location.href = "/signin"; });
}

render();
initCartDrawer();
initAccountMenu();
