import { button, cartIcon, wordmark } from "./components.js";
import { DEMO_USERNAME, isSignedIn, getProfile, updateProfile } from "./state.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
let view = params.get("view") || "settings";
let currentPasswordVisible = false;
let newPasswordVisible = false;
let confirmPasswordVisible = false;

function goTo(nextView) {
  view = nextView;
  render();
}

function render() {
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
        <span data-auth-slot></span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>

    ${!signedIn ? renderSignedOut() : renderView()}

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

function renderSignedOut() {
  return `
    <section class="search-toolbar"><h1 class="search-toolbar__heading">Account settings</h1></section>
    <section class="results-block">
      <p class="taken-domain__dates">You\u2019re not signed in.</p>
      <div class="taken-domain__actions">${button({ label: "Sign in" })}</div>
    </section>
  `;
}

function renderView() {
  switch (view) {
    case "edit-account": return renderEditAccount();
    case "change-password": return renderChangePassword();
    default: return renderSettings();
  }
}

function breadcrumb(trail) {
  const prev = trail.length > 1 ? trail[trail.length - 2] : null;
  const backLink = prev ? `<a href="#" class="account-back" data-crumb="${prev.view}"><span aria-hidden="true">\u2190</span> Back to ${prev.label}</a>` : "";
  return `
    ${backLink}
    <p class="account-breadcrumb">${trail.map((t, i) => i === trail.length - 1
      ? `<span class="account-breadcrumb__current">${t.label}</span>`
      : `<a href="#" data-crumb="${t.view}">${t.label}</a> <span aria-hidden="true">\u203a</span>`
    ).join(" ")}</p>
  `;
}

function accountRow({ icon, title, action, body }) {
  return `
    <div class="account-row">
      <div class="account-row__header">
        <div class="account-row__title-group">
          <span class="account-row__icon">${icon}</span>
          <strong>${title}</strong>
        </div>
        ${action}
      </div>
      <div class="account-row__body">${body}</div>
    </div>
  `;
}

function renderSettings() {
  const profile = getProfile();

  return `
    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Account settings</h1>
      <p class="taken-domain__dates">Manage your account and preferences.</p>
    </section>
    <section class="results-block">
      ${accountRow({
        icon: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
        title: "Account",
        action: `<a href="#" class="text-action account-row__action" data-goto="edit-account">Edit account \u2192</a>`,
        body: `<div class="account-row__fields">
          <div><p class="account-row__label">Username</p><p>${(typeof window !== "undefined" && window.__NAMENICE_USER__) ? window.__NAMENICE_USER__ : "there"}</p></div>
          <div><p class="account-row__label">Email</p><p>${profile.email || "\u2014"}</p></div>
        </div>`,
      })}

      ${accountRow({
        icon: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.4"/></svg>',
        title: "Security",
        action: `<a href="#" class="text-action account-row__action" data-goto="change-password">Change password \u2192</a>`,
        body: `<div class="account-row__fields"><div><p class="account-row__label">Password</p><p>\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</p></div></div>`,
      })}

      ${accountRow({
        icon: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 8h14" stroke="currentColor" stroke-width="1.4"/></svg>',
        title: "Billing",
        action: `<button type="button" class="text-action account-row__action" data-manage-stripe>Manage billing in Stripe \u2192</button>`,
        body: `<p class="taken-domain__dates" style="margin:0;">Payments and billing are handled securely by Stripe.</p>
          <p class="taken-domain__dates" id="stripe-note" style="display:none; margin-top: var(--space-2);">This would open Stripe\u2019s billing portal in a real integration.</p>`,
      })}

      ${accountRow({
        icon: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M8 4H4v12h4M13 10H4M13 10l-3-3M13 10l-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        title: "Sign out",
        action: `<button type="button" class="button button--primary account-row__action" data-sign-out>Sign out</button>`,
        body: `<p class="taken-domain__dates" style="margin:0;">Sign out of your account on this device.</p>`,
      })}
    </section>
  `;
}

function renderEditAccount() {
  const p = getProfile();
  return `
    <section class="search-toolbar">
      ${breadcrumb([{ label: "Account settings", view: "settings" }, { label: "Edit account" }])}
      <h1 class="search-toolbar__heading">Edit account</h1>
      <p class="taken-domain__dates">Update your account information and how we reach you.</p>
    </section>
    <div class="checkout-layout">
      <section class="results-block checkout-main">
        <p class="results-block__label">Profile information</p>
        <p class="taken-domain__dates">This information will be used for your account and order communication.</p>
        <form id="edit-account-form" novalidate style="margin-top: var(--space-4);">
          <div class="account-form-grid">
            <div class="field-group">
              <label class="field-label" for="edit-username">Username</label>
              <input class="field" type="text" id="edit-username" value="${(typeof window !== "undefined" && window.__NAMENICE_USER__) ? window.__NAMENICE_USER__ : "there"}" disabled />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-fullname">Full name</label>
              <input class="field" type="text" id="edit-fullname" value="${p.fullName}" />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-email">Email address</label>
              <input class="field" type="email" id="edit-email" value="${p.email}" placeholder="you@example.com" />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-phone">Phone number (optional)</label>
              <input class="field" type="tel" id="edit-phone" value="${p.phone}" placeholder="+66 81 234 5678" />
            </div>
          </div>

          <div style="border-top: var(--border-default); margin-top: var(--space-6); padding-top: var(--space-6);">
            <p class="results-block__label" style="margin-bottom: var(--space-2);">Communication preferences</p>
            <p class="taken-domain__dates">Choose what emails you\u2019d like to receive from namenice.</p>
            <label class="account-checkbox">
              <input type="checkbox" id="comm-order" ${p.commOrderUpdates ? "checked" : ""} />
              <span><strong>Order and account updates</strong><span class="account-checkbox__desc">Receipts, invoices, and important account alerts.</span></span>
            </label>
            <label class="account-checkbox">
              <input type="checkbox" id="comm-news" ${p.commProductNews ? "checked" : ""} />
              <span><strong>Product news and offers</strong><span class="account-checkbox__desc">News, features, and exclusive offers.</span></span>
            </label>
          </div>

          <div class="price-decision__actions" style="margin-top: var(--space-6);">
            ${button({ label: "Save changes" })}
            ${button({ label: "Cancel", kind: "secondary" })}
          </div>
        </form>
      </section>
      <aside class="checkout-summary">
        <p class="results-block__label">Your information is safe</p>
        <p class="taken-domain__dates">We use industry-standard security to protect your personal data and never share it with third parties.</p>
      </aside>
    </div>
  `;
}

function renderChangePassword() {
  return `
    <section class="search-toolbar">
      ${breadcrumb([{ label: "Account settings", view: "settings" }, { label: "Change password" }])}
      <h1 class="search-toolbar__heading">Change password</h1>
      <p class="taken-domain__dates">Choose a strong password to keep your account secure.</p>
    </section>
    <div class="checkout-layout">
      <section class="results-block checkout-main">
        <form id="change-password-form" novalidate style="max-width:420px;">
          ${passwordField("current-password", "Current password", currentPasswordVisible)}
          <p class="taken-domain__dates" style="margin: var(--space-2) 0 var(--space-4);"><a class="text-action" href="signin.html">Forgot your password?</a></p>
          ${passwordField("new-password", "New password", newPasswordVisible)}
          <p class="field-help" style="margin-top: var(--space-2);">Use at least 8 characters with a mix of letters, numbers, and symbols.</p>
          ${passwordField("confirm-password", "Confirm new password", confirmPasswordVisible)}
          <p class="field-help" id="password-match-error" style="color: var(--color-error);" hidden>Passwords don\u2019t match.</p>
          <div class="price-decision__actions" style="margin-top: var(--space-6);">
            ${button({ label: "Update password" })}
            ${button({ label: "Cancel", kind: "secondary" })}
          </div>
        </form>
      </section>
      <aside class="checkout-summary">
        <p class="results-block__label">Keep your account secure</p>
        <p class="taken-domain__dates">A strong password helps protect your account and your domains.</p>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>\u2713 Use a unique password</strong></div></div>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>\u2713 Avoid using personal information</strong></div></div>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>\u2713 Change it regularly</strong></div></div>
      </aside>
    </div>
  `;
}

function passwordField(id, label, visible) {
  return `
    <div class="field-group" style="margin-top: var(--space-4);">
      <label class="field-label" for="${id}">${label}</label>
      <div style="position:relative;">
        <input class="field" type="${visible ? "text" : "password"}" id="${id}" autocomplete="off" style="padding-right:40px;" />
        <button type="button" data-toggle-visibility="${id}" aria-label="${visible ? "Hide" : "Show"} password" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); border:0; background:transparent; cursor:pointer; color: var(--color-text-secondary); padding:4px;">
          ${eyeIcon(visible)}
        </button>
      </div>
    </div>
  `;
}

function eyeIcon(visible) {
  return visible
    ? `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.4"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M8.3 8.4a2.3 2.3 0 0 0 3.3 3.3M6 5.7C3.6 7 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M11.8 4.9c2.5.7 4 3 6.2 5.1 0 0-.7 1.3-2 2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function bindEvents() {
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      goTo(el.dataset.goto);
    });
  });

  document.querySelectorAll("[data-crumb]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      goTo(el.dataset.crumb);
    });
  });

  const signInBtn = document.querySelector(".results-block .button--primary");
  if (!isSignedIn() && signInBtn) {
    signInBtn.addEventListener("click", () => { window.location.href = "signin.html"; });
    return;
  }

  const editForm = document.querySelector("#edit-account-form");
  if (editForm) {
    const submitBtn = editForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      updateProfile({
        fullName: document.querySelector("#edit-fullname").value.trim(),
        email: document.querySelector("#edit-email").value.trim(),
        phone: document.querySelector("#edit-phone").value.trim(),
        commOrderUpdates: document.querySelector("#comm-order").checked,
        commProductNews: document.querySelector("#comm-news").checked,
      });
      goTo("settings");
    });
    editForm.querySelector(".button--secondary").addEventListener("click", () => goTo("settings"));
  }

  const pwForm = document.querySelector("#change-password-form");
  if (pwForm) {
    document.querySelectorAll("[data-toggle-visibility]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.toggleVisibility;
        if (id === "current-password") currentPasswordVisible = !currentPasswordVisible;
        if (id === "new-password") newPasswordVisible = !newPasswordVisible;
        if (id === "confirm-password") confirmPasswordVisible = !confirmPasswordVisible;
        render();
      });
    });
    const submitBtn = pwForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    pwForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const newPw = document.querySelector("#new-password").value;
      const confirmPw = document.querySelector("#confirm-password").value;
      if (newPw !== confirmPw) {
        document.querySelector("#password-match-error").hidden = false;
        return;
      }
      document.querySelector("#password-match-error").hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Updating\u2026";
      window.setTimeout(() => goTo("settings"), 500);
    });
    pwForm.querySelector(".button--secondary").addEventListener("click", () => goTo("settings"));
  }

  const stripeBtn = document.querySelector("[data-manage-stripe]");
  if (stripeBtn) {
    stripeBtn.addEventListener("click", () => {
      document.querySelector("#stripe-note").style.display = "block";
    });
  }
}

render();
initCartDrawer();
initAccountMenu();
