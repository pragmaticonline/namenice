const TLD_OPTIONS = [".net", ".com", ".io", ".co", ".org"];

let menuInjected = false;
let activeTrigger = null;
let onSelectCallback = null;
let scrollHandler = null;

function menuMarkup() {
  return `
    <div class="tld-menu" id="tld-menu" role="listbox" aria-label="Choose a TLD" hidden>
      ${TLD_OPTIONS.map((t) => `<button type="button" class="tld-menu__option" data-tld-option="${t}" role="option">${t}</button>`).join("")}
    </div>
  `;
}

function positionMenu(trigger) {
  const menu = document.querySelector("#tld-menu");
  const rect = trigger.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 100;
  const left = Math.min(rect.left, window.innerWidth - menuWidth - 16);
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(16, left)}px`;
}

function openMenu(trigger) {
  const menu = document.querySelector("#tld-menu");
  positionMenu(trigger);
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  activeTrigger = trigger;
  scrollHandler = () => positionMenu(trigger);
  window.addEventListener("scroll", scrollHandler, true);
}

function closeMenu() {
  const menu = document.querySelector("#tld-menu");
  if (menu) menu.hidden = true;
  document.querySelectorAll("[data-tld-trigger]").forEach((t) => t.setAttribute("aria-expanded", "false"));
  activeTrigger = null;
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler, true);
    scrollHandler = null;
  }
}

/** onSelect(tld, triggerEl) is called whenever a TLD is chosen, so the page can update its own state and re-render. */
export function initTldDropdown(onSelect) {
  onSelectCallback = onSelect;
  if (menuInjected) return;
  menuInjected = true;

  document.body.insertAdjacentHTML("beforeend", menuMarkup());

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-tld-trigger]");
    const option = event.target.closest("[data-tld-option]");

    if (trigger) {
      event.preventDefault();
      const menu = document.querySelector("#tld-menu");
      const wasHidden = menu.hidden;
      closeMenu();
      if (wasHidden) openMenu(trigger);
      return;
    }
    if (option) {
      const value = option.dataset.tldOption;
      const trig = activeTrigger;
      closeMenu();
      if (onSelectCallback) onSelectCallback(value, trig);
      return;
    }
    if (!event.target.closest("#tld-menu")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", closeMenu);
}
