import { authNavLinks, button } from "./components.js";
import {
  getCart, removeFromCart, setCartItemBundle, getCartCount,
  isSignedIn, DEMO_USERNAME,
} from "./state.js";
import { bundleOptions, getBundleOption } from "./mocks/bundle-options.js";

let injected = false;
let expandedDomain = null; // which cart item's bundle picker is open
let authMode = "cart"; // 'cart' | 'signin' | 'signup' \u2014 inline, no page navigation

function cartSubtotal(items) {
  return items.reduce((sum, item) => sum + getBundleOption(item.bundle).price, 0);
}

export function updateCartBadges() {
  const count = getCartCount();
  document.querySelectorAll(".cart-icon__count").forEach((el) => el.remove());
  document.querySelectorAll(".cart-icon").forEach((icon) => {
    icon.setAttribute("aria-label", count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart");
    if (count > 0) {
      icon.insertAdjacentHTML("beforeend", `<span class="cart-icon__count">${count}</span>`);
    }
  });
}

/** Updates every [data-auth-slot] on the page (the Sign in/Create account or Signed in/Sign out area) to match the current signed-in state. Call after every page render, same as updateCartBadges. */
export function updateAuthNav() {
  const signedIn = isSignedIn();
  document.querySelectorAll("[data-auth-slot]").forEach((slot) => {
    const displayName = (typeof window !== "undefined" && window.__NAMENICE_USER__) ? window.__NAMENICE_USER__ : DEMO_USERNAME;
    slot.innerHTML = authNavLinks(signedIn, displayName);
  });
}

/** Notification-only feedback for Add to cart \u2014 updates the badge and gives it a brief pulse, without opening the drawer. */
export function pulseCartBadge() {
  updateCartBadges();
  document.querySelectorAll(".cart-icon__count").forEach((el) => {
    el.classList.remove("cart-icon__count--pulse");
    // Force reflow so the animation can restart if triggered again quickly.
    void el.offsetWidth;
    el.classList.add("cart-icon__count--pulse");
  });
}

function renderDrawer() {
  const panel = document.querySelector("#cart-drawer-panel");
  if (!panel) return;

  if (authMode !== "cart") {
    panel.innerHTML = renderInlineAuth();
    bindAuthEvents();
    return;
  }

  const items = getCart();
  const subtotal = cartSubtotal(items);
  const signedIn = isSignedIn();

  panel.innerHTML = `
    <div class="cart-drawer__header">
      <h2>Your cart${items.length > 0 ? ` (${items.length})` : ""}</h2>
      <button type="button" id="cart-drawer-close" aria-label="Close cart">\u2715</button>
    </div>
    ${items.length === 0 ? `
      <div class="cart-drawer__empty">
        <p>Your cart is empty.</p>
        ${button({ label: "Search domains" })}
      </div>
    ` : `
      <div class="cart-drawer__items">
        ${items.map((item) => renderCartItem(item)).join("")}
      </div>
      <p class="cart-drawer__mock-note">Bundle prices shown are placeholder figures for internal review.</p>
      <div class="cart-drawer__subtotal">
        <span>Subtotal</span>
        <strong>$${subtotal.toFixed(2)}</strong>
      </div>
      ${signedIn ? `
        <p class="cart-drawer__status">Signed in \u00b7 <button type="button" class="text-action" id="cart-drawer-signout">Sign out</button></p>
        <div class="cart-drawer__actions">${button({ label: "Continue to checkout" })}</div>
      ` : `
        <p class="cart-drawer__status">Sign in or create an account to complete checkout.</p>
        <div class="cart-drawer__actions">
          ${button({ label: "Create account" })}
          ${button({ label: "Sign in", kind: "secondary" })}
        </div>
      `}
    `}
  `;

  bindDrawerEvents();
}

function renderCartItem(item) {
  const isOpen = expandedDomain === item.domain;
  const current = getBundleOption(item.bundle || "domain");
  return `
    <div class="cart-drawer__item">
      <button type="button" class="cart-drawer__item-row" data-toggle-domain="${item.domain}" aria-expanded="${isOpen}">
        <span class="cart-drawer__item-name">
          <strong>${item.domain}</strong>
          <span class="cart-drawer__item-package">${current.label}</span>
        </span>
        <span class="cart-drawer__item-right">
          <span class="cart-drawer__item-price">$${current.price.toFixed(2)}</span>
          <span class="cart-drawer__chevron" aria-hidden="true">${isOpen ? "\u2303" : "\u2304"}</span>
        </span>
      </button>
      <button type="button" class="cart-drawer__remove" data-remove-domain="${item.domain}" aria-label="Remove ${item.domain} from cart">Remove</button>
      ${isOpen ? `
        <div class="cart-drawer__bundle-options" role="radiogroup" aria-label="Package for ${item.domain}">
          ${bundleOptions.map((option) => `
            <label class="cart-drawer__bundle-option">
              <input type="radio" name="bundle-${item.domain}" value="${option.id}" data-bundle-domain="${item.domain}" ${current.id === option.id ? "checked" : ""} />
              <span class="cart-drawer__bundle-text">
                <span class="cart-drawer__bundle-label">${option.label}</span>
                <span class="cart-drawer__bundle-desc">${option.description}</span>
              </span>
              <span class="cart-drawer__bundle-price">$${option.price.toFixed(2)}</span>
            </label>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderInlineAuth() {
  const isSignup = authMode === "signup";
  return `
    <div class="cart-drawer__header">
      <button type="button" class="cart-drawer__back" id="cart-auth-back" aria-label="Back to cart">\u2190 Back to cart</button>
      <button type="button" id="cart-drawer-close" aria-label="Close cart">\u2715</button>
    </div>
    <div class="cart-drawer__auth">
      <h2 class="cart-drawer__auth-heading">${isSignup ? "Create your account" : "Sign in to namenice"}</h2>
      <p class="cart-drawer__auth-lede">${isSignup ? "Just enough to save your cart and check out." : "Welcome back."}</p>
      <p class="cart-drawer__auth-lede" style="color: var(--color-text-secondary); font-size: 13px;">Secure auth via Better Auth — HttpOnly session cookie.</p>
      <form id="cart-auth-form" novalidate>
        <div class="field-group">
          <label class="field-label" for="cart-auth-username">Email address</label>
          <input class="field" type="email" id="cart-auth-username" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="field-group">
          <label class="field-label" for="cart-auth-password">Password</label>
          <input class="field" type="password" id="cart-auth-password" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
          <p class="field-help" id="cart-auth-error-help" style="color: var(--color-error);" hidden>Incorrect username or password.</p>
        </div>
        ${button({ label: isSignup ? "Create account" : "Sign in" })}
      </form>
      <p class="auth-switch">
        ${isSignup ? "Already have an account?" : "New to namenice?"}
        <a href="#" id="cart-auth-switch">${isSignup ? "Sign in" : "Create an account"}</a>
      </p>
      <p class="auth-note">Secure auth via Better Auth. Session cookie is HttpOnly.</p>
    </div>
  `;
}

function bindAuthEvents() {
  document.querySelector("#cart-drawer-close").addEventListener("click", closeCartDrawer);
  document.querySelector("#cart-auth-back").addEventListener("click", () => {
    authMode = "cart";
    renderDrawer();
  });
  document.querySelector("#cart-auth-switch").addEventListener("click", (event) => {
    event.preventDefault();
    authMode = authMode === "signup" ? "signin" : "signup";
    renderDrawer();
  });

  const form = document.querySelector("#cart-auth-form");
  const submitButton = form.querySelector(".button--primary");
  submitButton.type = "submit";
  const usernameField = document.querySelector("#cart-auth-username");
  const passwordField = document.querySelector("#cart-auth-password");
  const errorHelp = document.querySelector("#cart-auth-error-help");
  const status = document.querySelector("#cart-auth-status") || document.querySelector(".auth-note");
  const isSignup = authMode === "signup";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!usernameField.value.trim() || !passwordField.value) { errorHelp.hidden = false; errorHelp.textContent = "Email and password required"; return; }
    errorHelp.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = isSignup ? "Creating account\u2026" : "Signing in\u2026";

        status.textContent = "";
    try {
      const url = isSignup ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const email = usernameField.value.trim();
      const password = passwordField.value;
      const body = isSignup ? { email, password, name: email.split("@")[0] } : { email, password };
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { errorHelp.textContent = j.message || j.error || "Failed: " + r.status; errorHelp.hidden = false; submitButton.disabled = false; return; }
      status.textContent = "Success \u2014 redirecting\u2026";
      authMode = "cart";
      renderDrawer();
      updateAuthNav();
      updateCartBadges();
    } catch (e) { errorHelp.textContent = String(e.message || e); errorHelp.hidden = false; submitButton.disabled = false; }
  });
}

function bindDrawerEvents() {
  const panel = document.querySelector("#cart-drawer-panel");
  const closeBtn = document.querySelector("#cart-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closeCartDrawer);

  const searchBtn = panel.querySelector(".cart-drawer__empty .button--primary");
  if (searchBtn) searchBtn.addEventListener("click", () => { window.location.href = "search.html"; });

  panel.querySelectorAll("[data-toggle-domain]").forEach((row) => {
    row.addEventListener("click", () => {
      const domain = row.dataset.toggleDomain;
      expandedDomain = expandedDomain === domain ? null : domain;
      renderDrawer();
    });
  });

  panel.querySelectorAll("[data-remove-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.dataset.removeDomain);
      if (expandedDomain === btn.dataset.removeDomain) expandedDomain = null;
      renderDrawer();
      updateCartBadges();
    });
  });

  panel.querySelectorAll("[data-bundle-domain]").forEach((radio) => {
    radio.addEventListener("change", () => {
      setCartItemBundle(radio.dataset.bundleDomain, radio.value);
      expandedDomain = null;
      renderDrawer();
    });
  });

  const checkoutBtn = panel.querySelector(".cart-drawer__actions .button--primary");
  if (checkoutBtn && isSignedIn()) {
    checkoutBtn.addEventListener("click", () => { window.location.href = "checkout.html"; });
  } else if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => { authMode = "signup"; renderDrawer(); });
  }
  const signinBtn = panel.querySelector(".cart-drawer__actions .button--secondary");
  if (signinBtn) signinBtn.addEventListener("click", () => { authMode = "signin"; renderDrawer(); });

  const signOutBtn = document.querySelector("#cart-drawer-signout");
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    setSignedIn(false);
    renderDrawer();
  });
}

export function openCartDrawer() {
  authMode = "cart";
  renderDrawer();
  document.querySelector("#cart-drawer-overlay").hidden = false;
  document.querySelector("#cart-drawer").classList.add("is-open");
  document.querySelector("#cart-drawer").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

export function closeCartDrawer() {
  document.querySelector("#cart-drawer-overlay").hidden = true;
  document.querySelector("#cart-drawer").classList.remove("is-open");
  document.querySelector("#cart-drawer").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

export function initCartDrawer() {
  updateCartBadges();
  updateAuthNav();
  if (injected) return;
  injected = true;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="cart-drawer-overlay" id="cart-drawer-overlay" hidden></div>
    <aside class="cart-drawer" id="cart-drawer" aria-hidden="true" aria-label="Your cart">
      <div id="cart-drawer-panel"></div>
    </aside>
  `);

  document.addEventListener("click", (event) => {
    const icon = event.target.closest(".cart-icon");
    if (icon) {
      event.preventDefault();
      openCartDrawer();
    }
  });

  document.addEventListener("click", (event) => {
    const signOutBtn = event.target.closest("[data-sign-out]");
    if (signOutBtn) {
      setSignedIn(false);
      updateAuthNav();
    }
  });

  document.querySelector("#cart-drawer-overlay").addEventListener("click", closeCartDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCartDrawer();
  });
}
