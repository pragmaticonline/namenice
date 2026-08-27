import { DEMO_USERNAME } from "./state.js";

let injected = false;

function menuMarkup() {
  return `
    <div class="account-menu" id="account-menu" role="menu" aria-label="Account menu" hidden>
      <p class="account-menu__email">${DEMO_USERNAME}</p>
      <a href="/domains" role="menuitem">My Domains</a>
      <a href="/orders" role="menuitem">Orders</a>
      <a href="/transfer" role="menuitem">Transfer a domain</a>
      <a href="/account" role="menuitem">Account settings</a>
      <div class="account-menu__divider"></div>
      <button type="button" data-sign-out role="menuitem">Sign out</button>
    </div>
  `;
}

function openAccountMenu(trigger) {
  const menu = document.querySelector("#account-menu");
  const rect = trigger.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
}

export function closeAccountMenu() {
  const menu = document.querySelector("#account-menu");
  if (!menu) return;
  menu.hidden = true;
  document.querySelectorAll("[data-account-trigger]").forEach((t) => t.setAttribute("aria-expanded", "false"));
}

export function initAccountMenu() {
  if (injected) return;
  injected = true;

  document.body.insertAdjacentHTML("beforeend", menuMarkup());

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-account-trigger]");
    const menu = document.querySelector("#account-menu");
    if (trigger) {
      event.preventDefault();
      const wasHidden = menu.hidden;
      closeAccountMenu();
      if (wasHidden) openAccountMenu(trigger);
      return;
    }
    if (!event.target.closest("#account-menu")) {
      closeAccountMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-sign-out]")) closeAccountMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAccountMenu();
  });

  window.addEventListener("resize", closeAccountMenu);
}
