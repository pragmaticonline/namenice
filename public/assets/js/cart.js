import { button, cartIcon, wordmark } from "./components.js";
import { getCart, removeFromCart, setCartItemBundle, isSignedIn, setSignedIn } from "./state.js";
import { bundleOptions, getBundleOption } from "./mocks/bundle-options.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

function subtotal(items) {
  return items.reduce((sum, item) => sum + getBundleOption(item.bundle).price, 0);
}

function render() {
  const items = getCart();
  const signedIn = isSignedIn();

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
        <span data-auth-slot>
          <a href="signin.html">Sign in</a>
          <a href="signup.html">Create account</a>
        </span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Your cart${items.length > 0 ? ` (${items.length})` : ""}</h1>
    </section>

    ${items.length === 0 ? `
      <section class="results-block">
        <p class="taken-domain__dates">Your cart is empty.</p>
        <div class="taken-domain__actions">${button({ label: "Search domains" })}</div>
      </section>
    ` : `
      <section class="results-block">
        <div class="row-group">
          ${items.map((item) => `
            <div class="cart-page-item">
              <div class="cart-page-item__head">
                <strong>${item.domain}</strong>
                <button type="button" class="text-action" data-remove-domain="${item.domain}">Remove</button>
              </div>
              <div class="cart-drawer__bundle-options">
                ${bundleOptions.map((option) => `
                  <label class="cart-drawer__bundle-option">
                    <input type="radio" name="bundle-${item.domain}" value="${option.id}" data-bundle-domain="${item.domain}" ${(item.bundle || "domain") === option.id ? "checked" : ""} />
                    <span class="cart-drawer__bundle-text">
                      <span class="cart-drawer__bundle-label">${option.label}</span>
                      <span class="cart-drawer__bundle-desc">${option.description}</span>
                    </span>
                    <span class="cart-drawer__bundle-price">$${option.price.toFixed(2)}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
        <p class="cart-drawer__mock-note" style="margin-left:0;">Bundle prices shown are placeholder figures for internal review.</p>
        <div class="cart-drawer__subtotal" style="padding:var(--space-4) 0;">
          <span>Subtotal</span>
          <strong>$${subtotal(items).toFixed(2)}</strong>
        </div>
        ${signedIn ? `
          <p class="cart-drawer__status" style="padding:0;">Signed in \u00b7 <button type="button" class="text-action" id="cart-page-signout">Sign out</button></p>
          <div class="taken-domain__actions">${button({ label: "Continue to checkout" })}</div>
        ` : `
          <p class="cart-drawer__status" style="padding:0;">Sign in or create an account to complete checkout.</p>
          <div class="taken-domain__actions" style="display:flex; gap: var(--space-4);">
            ${button({ label: "Create account" })}
            ${button({ label: "Sign in", kind: "secondary" })}
          </div>
        `}
      </section>
    `}
  `;

  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function bindEvents() {
  if (getCart().length === 0) {
    const searchBtn = document.querySelector(".results-block .button--primary");
    if (searchBtn) searchBtn.addEventListener("click", () => { window.location.href = "search.html"; });
    return;
  }

  document.querySelectorAll("[data-remove-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.dataset.removeDomain);
      render();
    });
  });

  document.querySelectorAll("[data-bundle-domain]").forEach((radio) => {
    radio.addEventListener("change", () => {
      setCartItemBundle(radio.dataset.bundleDomain, radio.value);
      render();
    });
  });

  const checkoutBtn = document.querySelector(".taken-domain__actions .button--primary");
  if (checkoutBtn && getCart().length > 0) {
    checkoutBtn.addEventListener("click", () => {
      window.location.href = isSignedIn() ? "checkout.html" : "signup.html?next=cart.html";
    });
  }
  const signinBtn = document.querySelector(".taken-domain__actions .button--secondary");
  if (signinBtn) signinBtn.addEventListener("click", () => { window.location.href = "signin.html?next=cart.html"; });

  const signOutBtn = document.querySelector("#cart-page-signout");
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    setSignedIn(false);
    render();
  });
}

render();
initCartDrawer();
initAccountMenu();
