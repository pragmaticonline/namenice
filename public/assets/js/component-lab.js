import { button, domainResultRow, domainSearch, statusBadge } from "./components.js";
import { domainSearchMock } from "./mocks/domain-search-mock.js";

const app = document.querySelector("#app");
let searchState = "initial";
let query = domainSearchMock.initialQuery;

function render() {
  const result = searchState === "unavailable" ? domainSearchMock.unavailable
    : searchState === "premium" ? domainSearchMock.premium
      : domainSearchMock.available;
  const suggestions = searchState === "unavailable" ? domainSearchMock.suggestions : [];

  app.innerHTML = `
    <header class="lab-header">
      <p class="eyebrow">NameNice / foundation validation</p>
      <h1>Components that make progress feel clear.</h1>
      <p>Frozen tokens, mock data, and high-fidelity presentation states. This is not a homepage.</p>
    </header>
    <section class="lab-section lab-section--search">
      <div class="lab-section__heading"><div><p class="eyebrow">01 / signature component</p><h2>Domain search</h2></div><span>12px signature radius · teal focus · orange commitment</span></div>
      ${domainSearch({ query, state: searchState, result, suggestions })}
      <div class="state-switcher" aria-label="Preview search states">
        ${["initial", "available", "unavailable", "premium", "selected"].map((state) => `<button type="button" data-preview-state="${state}" class="state-switcher__button${searchState === state ? " is-active" : ""}">${state}</button>`).join("")}
      </div>
    </section>
    <section class="lab-section">
      <div class="lab-section__heading"><div><p class="eyebrow">02 / core states</p><h2>CTA and form language</h2></div><span>Orange = commit · teal = focus and navigation</span></div>
      <div class="component-grid">
        <article class="component-panel"><h3>Primary CTA</h3><div class="component-stack">${button({ label: "Check availability" })}${button({ label: "Hover", state: "hover" })}${button({ label: "Focus", state: "focus" })}${button({ label: "Disabled", disabled: true })}</div></article>
        <article class="component-panel"><h3>Secondary CTA</h3><div class="component-stack">${button({ label: "Continue", kind: "secondary" })}${button({ label: "Hover", kind: "secondary", state: "hover" })}${button({ label: "Focus", kind: "secondary", state: "focus" })}${button({ label: "Disabled", kind: "secondary", disabled: true })}</div></article>
        <article class="component-panel"><h3>Form field</h3><label class="field-label" for="lab-email">Email address</label><input id="lab-email" class="field" placeholder="you@example.com" /><p class="field-help">We'll only use this for your account.</p><div class="field field--error">Enter a valid email address.</div></article>
      </div>
    </section>
    <section class="lab-section">
      <div class="lab-section__heading"><div><p class="eyebrow">03 / product truth</p><h2>Domain results and semantic states</h2></div><span>Rows first, cards never by default</span></div>
      <div class="domain-result-list">${domainResultRow(domainSearchMock.available, { action: "Add" })}${domainResultRow(domainSearchMock.unavailable, { action: "Why?" })}${domainResultRow(domainSearchMock.premium, { action: "View terms" })}${domainResultRow(domainSearchMock.suggestions[0], { selected: true, action: "Selected" })}</div>
      <div class="semantic-row"><div class="semantic-alert semantic-alert--success">${statusBadge("available")} <span>Domain added to your selection.</span></div><div class="semantic-alert semantic-alert--warning">${statusBadge("premium")} <span>Review purchase and renewal terms.</span></div><div class="semantic-alert semantic-alert--error">${statusBadge("unavailable")} <span>Try another domain name.</span></div></div>
    </section>
  `;
  bindEvents();
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
  document.querySelectorAll("[data-preview-state]").forEach((control) => control.addEventListener("click", () => {
    searchState = control.dataset.previewState;
    render();
  }));
}

render();
