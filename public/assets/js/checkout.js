import { button, cartIcon, wordmark } from "./components.js";
import {
  getCart, clearCart, isSignedIn, setSignedIn, checkDemoCredentials, DEMO_USERNAME,
  addOrder, addOwnedDomain,
} from "./state.js";
import { getBundleOption } from "./mocks/bundle-options.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");

let step = isSignedIn() ? "contact" : "account";
let contact = { name: "", email: "" };
let completedOrder = null;

function steps() {
  return isSignedIn() ? ["contact", "review"] : ["account", "contact", "review"];
}

function cartSubtotal(items) {
  return items.reduce((sum, item) => sum + getBundleOption(item.bundle).price, 0);
}

function render() {
  const items = getCart();

  app.innerHTML = `
    <nav class="site-nav">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__links">
        <a href="cart.html">Back to cart</a>
        <span data-auth-slot></span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    ${step === "success" ? renderSuccess() : items.length === 0 ? renderEmpty() : renderCheckout(items)}

    <footer class="site-footer">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-footer__text">
        <p>Domains, without the noise. \u00b7 <a href="transfer.html" style="color:inherit;">Transfer a domain</a></p>
        <p class="site-footer__copyright">\u00a9 2026 namenice. All rights reserved.</p>
      </div>
    </footer>
  `;

  bindEvents(items);
  updateCartBadges();
  updateAuthNav();
}

function renderEmpty() {
  return `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Checkout</h1></section>
    <section class="results-block">
      <p class="taken-domain__dates">Your cart is empty. Add a domain before checking out.</p>
      <div class="taken-domain__actions">${button({ label: "Search domains" })}</div>
    </section>
  `;
}

function renderCheckout(items) {
  const stepList = steps();
  const currentIndex = stepList.indexOf(step);
  const subtotal = cartSubtotal(items);

  return `
    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Checkout</h1>
      <div class="checkout-steps">
        ${stepList.map((s, i) => `
          <span class="checkout-steps__item${i === currentIndex ? " is-active" : i < currentIndex ? " is-done" : ""}">
            ${i + 1} ${stepLabel(s)}
          </span>
        `).join("<span class=\"checkout-steps__sep\">\u2022</span>")}
      </div>
    </section>

    <div class="checkout-layout">
      <section class="results-block checkout-main">
        ${step === "account" ? renderAccountStep() : ""}
        ${step === "contact" ? renderContactStep() : ""}
        ${step === "review" ? renderReviewStep(items) : ""}
        ${step === "redirecting" ? renderRedirectingStep() : ""}
      </section>

      <aside class="checkout-summary">
        <p class="results-block__label">Order summary</p>
        ${items.map((item) => {
          const opt = getBundleOption(item.bundle);
          return `<div class="checkout-summary__item">
            <div><strong>${item.domain}</strong><span>${opt.label}</span></div>
            <span>$${opt.price.toFixed(2)}</span>
          </div>`;
        }).join("")}
        <div class="checkout-summary__total">
          <span>Total</span>
          <strong>$${subtotal.toFixed(2)}</strong>
        </div>
      </aside>
    </div>
  `;
}

function stepLabel(s) {
  return { account: "Account", contact: "Contact", review: "Review" }[s];
}

function renderAccountStep() {
  return `
    <p class="results-block__label">Account</p>
    <p class="taken-domain__dates">Sign in or create an account to continue \u2014 this speeds up checkout next time too.</p>
    <p class="taken-domain__dates">Secure auth via Better Auth — HttpOnly session cookie.</p>
    <form id="checkout-auth-form" novalidate style="max-width:360px; margin-top: var(--space-5);">
      <div class="field-group">
        <label class="field-label" for="checkout-username">Username</label>
        <input class="field" type="text" id="checkout-username" placeholder="Enter your username" required />
      </div>
      <div class="field-group" style="margin-top: var(--space-4);">
        <label class="field-label" for="checkout-password">Password</label>
        <input class="field" type="password" id="checkout-password" placeholder="Enter your password" required />
        <p class="field-help" id="checkout-auth-error" style="color: var(--color-error);" hidden>Incorrect username or password.</p>
      </div>
      <div style="margin-top: var(--space-5);">${button({ label: "Continue" })}</div>
      <p class="auth-note">Secure auth via Better Auth. Session cookie is HttpOnly.</p>
    </form>
  `;
}

function renderContactStep() {
  return `
    <p class="results-block__label">Contact information</p>
    <form id="checkout-contact-form" novalidate style="max-width:360px;">
      <div class="field-group">
        <label class="field-label" for="checkout-name">Full name</label>
        <input class="field" type="text" id="checkout-name" placeholder="Your name" value="${contact.name}" required />
      </div>
      <div class="field-group" style="margin-top: var(--space-4);">
        <label class="field-label" for="checkout-contact-email">Email</label>
        <input class="field" type="email" id="checkout-contact-email" placeholder="you@example.com" value="${contact.email}" required />
        <p class="field-help">Used for domain registration contact and order confirmation.</p>
      </div>
      <div style="margin-top: var(--space-5);">${button({ label: "Continue" })}</div>
    </form>
  `;
}

function renderReviewStep(items) {
  return `
    <p class="results-block__label">Review &amp; pay</p>
    <div class="row-group">
      ${items.map((item) => {
        const opt = getBundleOption(item.bundle);
        return `<div class="cart-page-item" style="padding: var(--space-4) 0; border-top: var(--border-default);">
          <div class="cart-page-item__head"><strong>${item.domain}</strong><span>$${opt.price.toFixed(2)}</span></div>
          <p class="taken-domain__dates">${opt.label} \u00b7 1 year registration</p>
        </div>`;
      }).join("")}
    </div>
    <p class="taken-domain__dates" style="margin-top: var(--space-5);">Contact: ${contact.name || "\u2014"} \u00b7 ${contact.email || "\u2014"}</p>
    <p class="taken-domain__dates" style="display:flex; align-items:center; gap: var(--space-2);">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.4"/></svg>
      Payment is handled securely by Stripe. You\u2019ll be redirected to complete payment.
    </p>
    <div style="margin-top: var(--space-6);">${button({ label: "Continue to Stripe" })}</div>
  `;
}

function renderRedirectingStep() {
  return `
    <div style="text-align:center; padding: var(--space-8) 0;">
      <p class="taken-domain__dates">Redirecting to Stripe\u2026</p>
    </div>
  `;
}

function renderSuccess() {
  const order = completedOrder;
  return `
    <section class="results-block your-search-panel" style="margin-top: var(--space-8);">
      <p class="results-block__label">Order complete</p>
      <h1 class="search-toolbar__heading" style="margin-bottom: var(--space-3);">Domain registered successfully.</h1>
      <p class="taken-domain__dates">This is demo behavior \u2014 no real domain was registered and no real payment was made (Stripe checkout is mocked in this prototype).</p>
      <div class="row-group" style="margin-top: var(--space-6);">
        <div class="cart-page-item" style="padding: var(--space-4) 0; border-top: var(--border-default);">
          <div class="cart-page-item__head"><strong>${order.domain}</strong><span>$${order.total.toFixed(2)}</span></div>
          <p class="taken-domain__dates">Order ${order.id} \u00b7 Registered for 1 year \u00b7 Renews ${new Date(order.renewsAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
          <p class="taken-domain__dates">Confirmation sent to ${order.email}</p>
        </div>
      </div>
      <div class="price-decision__actions" style="margin-top: var(--space-6);">
        ${button({ label: "Manage your domain" })}
        ${button({ label: "Search another domain", kind: "secondary" })}
      </div>
    </section>
  `;
}

function bindEvents(items) {
  const emptySearchBtn = document.querySelector(".results-block .button--primary");
  if (step !== "success" && items.length === 0 && emptySearchBtn) {
    emptySearchBtn.addEventListener("click", () => { window.location.href = "search.html"; });
    return;
  }

  if (step === "success") {
    document.querySelectorAll(".price-decision__actions .button").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        window.location.href = i === 0 ? `domains.html?d=${encodeURIComponent(completedOrder.domain)}` : "search.html";
      });
    });
    return;
  }

  const accountForm = document.querySelector("#checkout-auth-form");
  if (accountForm) {
    const submitBtn = accountForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    accountForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = document.querySelector("#checkout-username").value;
      const password = document.querySelector("#checkout-password").value;
      if (!username.trim() || !password) { errorHelp.hidden = false; errorHelp.textContent = "Email and password required"; if (typeof passwordField !== "undefined") passwordField.focus(); return; } if (false && !checkDemoCredentials(username, password)) {
        document.querySelector("#checkout-auth-error").hidden = false;
        document.querySelector("#checkout-password").focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in\u2026";
      window.setTimeout(() => {
        setSignedIn(true);
        step = "contact";
        render();
      }, 600);
    });
  }

  const contactForm = document.querySelector("#checkout-contact-form");
  if (contactForm) {
    const submitBtn = contactForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      contact.name = document.querySelector("#checkout-name").value.trim();
      contact.email = document.querySelector("#checkout-contact-email").value.trim();
      step = "review";
      render();
    });
  }

  const stripeBtn = document.querySelector(".checkout-main .button--primary");
  if (step === "review" && stripeBtn) {
    stripeBtn.addEventListener("click", () => {
      step = "redirecting";
      render();
      window.setTimeout(() => completePurchase(items), 900);
    });
  }
}

function completePurchase(items) {
  const subtotal = cartSubtotal(items);
  const orderId = `NN-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = Date.now();
  const renewsAt = now + 365 * 24 * 60 * 60 * 1000;

  // Prototype scope: register the first cart item as the completed order/domain.
  const primary = items[0];

  completedOrder = {
    id: orderId,
    domain: primary.domain,
    total: subtotal,
    email: contact.email || `${(typeof window !== "undefined" && window.__NAMENICE_USER__) ? window.__NAMENICE_USER__ : "there"}@example.com`,
    at: now,
    renewsAt,
  };

  addOrder(completedOrder);
  items.forEach((item) => {
    addOwnedDomain({ domain: item.domain, bundleLabel: getBundleOption(item.bundle).label });
  });
  clearCart();

  step = "success";
  render();
}

render();
initCartDrawer();
initAccountMenu();
