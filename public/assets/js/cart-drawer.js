import { button } from "./components.js";
import {
  getCart, removeFromCart, getCartCount,
} from "./state.js";

let injected = false;

function cartSubtotal(items) {
  return items.length * 14.99;
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

  const items = getCart();
  const subtotal = cartSubtotal(items);

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
      <div class="cart-drawer__subtotal">
        <span>Subtotal</span>
        <strong>$${subtotal.toFixed(2)}</strong>
      </div>
      <div class="cart-drawer__actions">${button({ label: "Continue to checkout" })}</div>
    `}
  `;

  bindDrawerEvents();
}

function renderCartItem(item) {
  return `
    <div class="cart-drawer__item">
      <div class="cart-drawer__item-row">
        <span class="cart-drawer__item-name">
          <strong>${item.domain}</strong>
          <span class="cart-drawer__item-package">1-year registration</span>
        </span>
        <span class="cart-drawer__item-right">
          <span class="cart-drawer__item-price">$14.99</span>
        </span>
      </div>
      <button type="button" class="cart-drawer__remove" data-remove-domain="${item.domain}" aria-label="Remove ${item.domain} from cart">Remove</button>
    </div>
  `;
}

function bindDrawerEvents() {
  const panel = document.querySelector("#cart-drawer-panel");
  const closeBtn = document.querySelector("#cart-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closeCartDrawer);

  const searchBtn = panel.querySelector(".cart-drawer__empty .button--primary");
  if (searchBtn) searchBtn.addEventListener("click", () => { window.location.href = "/search"; });

  panel.querySelectorAll("[data-remove-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.dataset.removeDomain);
      renderDrawer();
      updateCartBadges();
    });
  });

  const checkoutBtn = panel.querySelector(".cart-drawer__actions .button--primary");
  if (checkoutBtn) checkoutBtn.addEventListener("click", () => { window.location.href = "/checkout"; });
}

export function openCartDrawer() {
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

  document.querySelector("#cart-drawer-overlay").addEventListener("click", closeCartDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCartDrawer();
  });
}
