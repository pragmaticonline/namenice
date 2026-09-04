import { button, cartIcon, wordmark } from "./components.js";
import { isSignedIn, setSignedIn, checkDemoCredentials, addTransferRequest, formatDate } from "./state.js";
import { transferScenarios, FAILING_AUTH_CODE } from "./mocks/transfer-mock.js";
import { initCartDrawer, updateAuthNav, updateCartBadges } from "./cart-drawer.js";
import { initAccountMenu } from "./account-menu.js";

const app = document.querySelector("#app");
const TRANSFER_PRICE = 12.99;

let step = "domain";
let domainInput = "";
let domainError = null;
let eppCode = "";
let codeVisible = false;
let helpOpen = false;
let ineligibleReason = null;
let completedTransfer = null;

function resetFlow() {
  step = "domain";
  domainInput = "";
  domainError = null;
  eppCode = "";
  ineligibleReason = null;
}

function validateDomainInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Enter a domain to continue." };
  const domainPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!domainPattern.test(trimmed)) return { error: "That doesn\u2019t look like a valid domain name." };
  if (!trimmed.toLowerCase().endsWith(".net")) return { error: "NameNice currently supports .net domain transfers." };
  return { value: trimmed.toLowerCase() };
}

function render() {
  app.innerHTML = `
    <nav class="site-nav site-nav--full">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__tabs">
        <a href="search.html" class="site-nav__tab">Search</a>
        <a href="history.html" class="site-nav__tab">History</a>
        <a href="favorites.html" class="site-nav__tab">Favorites</a>
        <a href="transfer.html" class="site-nav__tab site-nav__tab--secondary is-active">Transfer a domain</a>
      </div>
      <div class="site-nav__links">
        <span data-auth-slot></span>
        ${cartIcon({ count: 0 })}
      </div>
    </nav>
    ${renderBody()}
  `;
  bindEvents();
  updateCartBadges();
  updateAuthNav();
}

function renderBody() {
  switch (step) {
    case "domain": return renderDomainStep();
    case "checking": return renderCheckingStep();
    case "eligible": return renderEligibleStep();
    case "ineligible": return renderIneligibleStep();
    case "already-pending": return renderAlreadyPendingStep();
    case "requirements": return renderRequirementsStep();
    case "code": return renderCodeStep();
    case "review": return renderReviewStep();
    case "auth-gate": return renderAuthGateStep();
    case "submitting": return renderSubmittingStep();
    case "success": return renderSuccessStep();
    case "failed": return renderFailedStep();
    default: return renderDomainStep();
  }
}

function pageIntro() {
  return `
    <section class="search-toolbar">
      <h1 class="search-toolbar__heading">Transfer your domain</h1>
      <p class="taken-domain__dates">Move your domain to namenice and manage it alongside your other domains.</p>
    </section>
  `;
}

function renderDomainStep() {
  return `
    ${pageIntro()}
    <div class="checkout-layout">
      <section class="results-block checkout-main">
        <p class="results-block__label">Which domain would you like to transfer?</p>
        <form id="transfer-domain-form" novalidate style="max-width:420px;">
          <div class="field-group">
            <label class="field-label" for="transfer-domain-input">Domain</label>
            <input class="field" type="text" id="transfer-domain-input" placeholder="Enter your .net domain" value="${domainInput}" aria-invalid="${domainError ? "true" : "false"}" aria-describedby="${domainError ? "transfer-domain-error" : ""}" />
            ${domainError ? `<p class="field-help" id="transfer-domain-error" style="color: var(--color-error);">${domainError}</p>` : ""}
          </div>
          <div style="margin-top: var(--space-5);">${button({ label: "Check eligibility" })}</div>
          <p class="taken-domain__dates" style="margin-top: var(--space-4); display:flex; align-items:center; gap: var(--space-2);"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.4"/></svg> Transfers are currently supported for .net domains.</p>
        </form>
      </section>
      <aside class="checkout-summary">
        <p class="results-block__label">How domain transfers work</p>
        ${["Check eligibility", "Unlock your domain", "Enter your authorization code", "Start the transfer"].map((s, i) => `
          <div class="checkout-summary__item" style="border-bottom:0; padding-bottom: var(--space-2);">
            <div><strong>${i + 1}. ${s}</strong></div>
          </div>
        `).join("")}
        <p class="taken-domain__dates" style="margin-top: var(--space-4); padding-top: var(--space-4); border-top: var(--border-default);">Need help? <a class="text-action" href="#">Learn what you\u2019ll need before transferring</a></p>
      </aside>
    </div>
  `;
}

function renderCheckingStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="taken-domain__dates">Checking transfer eligibility\u2026</p>
    </section>
  `;
}

function renderEligibleStep() {
  return `
    ${pageIntro()}
    <section class="results-block your-search-panel">
      <div style="text-align:center; max-width:460px; margin: 0 auto;">
        <div class="hero-mark__ring" style="width:64px; height:64px; margin: 0 auto var(--space-4); border-width:3px;">
          <svg class="hero-mark__check" viewBox="0 0 24 24" fill="none" style="width:28px; height:28px;"><path d="M5 13l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="results-block__label" style="text-align:center;">Good news</p>
        <p class="price-decision__amount" style="font-size:20px; text-align:center;">${domainInput} can be transferred to namenice.</p>
      </div>
      <div class="row-group" style="max-width:420px; margin: var(--space-6) auto 0;">
        ${renderChecklistItem(".net domain")}
        ${renderChecklistItem("Domain is eligible for transfer")}
        ${renderChecklistItem("Authorization code required")}
      </div>
      <p class="taken-domain__dates" style="text-align:center; max-width:420px; margin: var(--space-5) auto 0;">Eligibility shown here is a prototype check. Final eligibility is confirmed during the transfer process.</p>
      <div style="text-align:center; margin-top: var(--space-6);">${button({ label: "Continue" })}</div>
    </section>
  `;
}

function renderChecklistItem(label) {
  return `<div class="cart-page-item" style="padding: var(--space-3) 0; border-top: var(--border-default); display:flex; align-items:center; gap: var(--space-3);">
    <span style="color: var(--color-status-success); flex-shrink:0;">\u2713</span><span>${label}</span>
  </div>`;
}

function renderIneligibleStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="results-block__label">This domain can\u2019t be transferred right now</p>
      <p class="taken-domain__dates">${ineligibleReason}</p>
      <div class="taken-domain__actions">${button({ label: "Check another domain" })}</div>
      <button type="button" class="text-action" id="transfer-learn-more" style="margin-top: var(--space-4); display:block;">Learn about transfer requirements</button>
      ${helpOpen ? `<p class="taken-domain__dates" style="margin-top: var(--space-3); max-width:460px;">A domain generally needs to be unlocked at its current registrar, past the first 60 days since registration or a prior transfer, and you\u2019ll need the domain\u2019s authorization (EPP) code.</p>` : ""}
    </section>
  `;
}

function renderAlreadyPendingStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="results-block__label">Transfer already in progress</p>
      <p class="taken-domain__dates">A transfer for ${domainInput} is already pending.</p>
      <div class="taken-domain__actions" style="display:flex; gap: var(--space-4);">
        ${button({ label: "View transfer status" })}
        ${button({ label: "Check another domain", kind: "secondary" })}
      </div>
    </section>
  `;
}

function renderRequirementsStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="results-block__label">Before you continue</p>
      <p class="taken-domain__dates">Make sure:</p>
      <div class="row-group" style="max-width:420px;">
        ${renderChecklistItem("Your domain is unlocked for transfer")}
        ${renderChecklistItem("You have the domain\u2019s authorization code")}
        ${renderChecklistItem("You can access the email associated with the domain")}
      </div>
      <div class="price-decision__actions" style="margin-top: var(--space-6);">
        ${button({ label: "Continue" })}
        ${button({ label: "Back", kind: "secondary" })}
      </div>
    </section>
  `;
}

function renderCodeStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="results-block__label">Enter your authorization code</p>
      <p class="taken-domain__dates">Your current registrar provides this code. It\u2019s sometimes called an EPP code or transfer code.</p>
      <form id="transfer-code-form" novalidate style="max-width:360px; margin-top: var(--space-4);">
        <div class="field-group">
          <label class="field-label" for="transfer-epp">Authorization code</label>
          <div style="position:relative;">
            <input class="field" type="${codeVisible ? "text" : "password"}" id="transfer-epp" value="${eppCode}" autocomplete="off" style="padding-right:40px;" required />
            <button type="button" id="transfer-epp-toggle" aria-label="${codeVisible ? "Hide authorization code" : "Show authorization code"}" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); border:0; background:transparent; cursor:pointer; color: var(--color-text-secondary); padding:4px;">
              ${codeVisible
                ? `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.4"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M8.3 8.4a2.3 2.3 0 0 0 3.3 3.3M6 5.7C3.6 7 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M11.8 4.9c2.5.7 4 3 6.2 5.1 0 0-.7 1.3-2 2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`}
            </button>
          </div>
        </div>
        <button type="button" id="transfer-help-toggle" class="text-action" style="margin-top: var(--space-3); display:block;">Where do I find this?</button>
        ${helpOpen ? `<p class="taken-domain__dates" style="margin-top: var(--space-3);">Sign in to your current registrar and look for your domain\u2019s transfer or authorization settings. The exact location varies by registrar.</p>` : ""}
        <div class="price-decision__actions" style="margin-top: var(--space-6);">
          ${button({ label: "Continue" })}
          ${button({ label: "Back", kind: "secondary" })}
        </div>
      </form>
    </section>
  `;
}

function renderReviewStep() {
  return `
    ${pageIntro()}
    <div class="checkout-layout">
      <section class="results-block checkout-main">
        <p class="results-block__label">Review your transfer</p>
        <p class="taken-domain__dates">Please review your transfer details before starting.</p>
        <div class="row-group" style="max-width:420px; margin-top: var(--space-4);">
          <div class="price-decision__row" style="border-top:0;">
            <div><p class="price-decision__label">Domain</p><p class="price-decision__amount" style="font-size:16px;">${domainInput}</p></div>
          </div>
          <div class="price-decision__row">
            <div><p class="price-decision__label">Transfer</p><p class="price-decision__amount" style="font-size:16px;">.NET domain transfer</p></div>
          </div>
          <div class="price-decision__row">
            <div><p class="price-decision__label">Price</p><p class="price-decision__amount" style="font-size:16px;">$${TRANSFER_PRICE.toFixed(2)}</p></div>
          </div>
          <div class="price-decision__row">
            <div><p class="price-decision__label">Registration extension</p><p class="price-decision__amount" style="font-size:16px;">+1 year</p></div>
          </div>
          <div class="price-decision__row">
            <div><p class="price-decision__label">Authorization code</p><p class="price-decision__amount" style="font-size:16px;">${"\u2022".repeat(Math.min(eppCode.length, 12) || 8)}</p></div>
          </div>
        </div>
        <p class="taken-domain__dates" style="margin-top: var(--space-5); max-width:420px;">By starting the transfer, you authorize namenice to act as the new registrar for this domain.</p>
        <div class="price-decision__actions" style="margin-top: var(--space-6);">
          ${button({ label: "Start transfer" })}
          ${button({ label: "Back", kind: "secondary" })}
        </div>
      </section>
      <aside class="checkout-summary">
        <p class="results-block__label">What happens next?</p>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>1. We\u2019ll verify your code and contact your current registrar.</strong></div></div>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>2. The transfer usually takes 5\u20137 days to complete.</strong></div></div>
        <div class="checkout-summary__item" style="border-bottom:0;"><div><strong>3. We\u2019ll email you when it\u2019s done.</strong></div></div>
      </aside>
    </div>
  `;
}

function renderAuthGateStep() {
  return `
    ${pageIntro()}
    <section class="results-block" style="max-width:360px;">
      <p class="results-block__label">Create an account to continue</p>
      <p class="taken-domain__dates">Your transferred domain will be managed from your namenice account.</p>
      <p class="taken-domain__dates">Secure auth via Better Auth — HttpOnly session cookie.</p>
      <form id="transfer-auth-form" novalidate style="margin-top: var(--space-5);">
        <div class="field-group">
          <label class="field-label" for="transfer-auth-username">Username</label>
          <input class="field" type="text" id="transfer-auth-username" placeholder="Enter your username" required />
        </div>
        <div class="field-group" style="margin-top: var(--space-4);">
          <label class="field-label" for="transfer-auth-password">Password</label>
          <input class="field" type="password" id="transfer-auth-password" placeholder="Enter your password" required />
          <p class="field-help" id="transfer-auth-error" style="color: var(--color-error);" hidden>Incorrect username or password.</p>
        </div>
        <div style="margin-top: var(--space-5);">${button({ label: "Continue" })}</div>
        <p class="auth-note">Secure auth via Better Auth. Session cookie is HttpOnly.</p>
      </form>
    </section>
  `;
}

function renderSubmittingStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="taken-domain__dates">Starting your transfer\u2026</p>
    </section>
  `;
}

function renderSuccessStep() {
  const t = completedTransfer;
  return `
    <section class="results-block your-search-panel" style="margin-top: var(--space-8);">
      <div style="text-align:center; max-width:460px; margin: 0 auto;">
        <div class="hero-mark__ring" style="width:64px; height:64px; margin: 0 auto var(--space-4); border-width:3px;">
          <svg class="hero-mark__check" viewBox="0 0 24 24" fill="none" style="width:28px; height:28px;"><path d="M5 13l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="results-block__label" style="text-align:center;">Transfer started</p>
        <p class="price-decision__amount" style="font-size:20px; text-align:center;">Your transfer request for ${t.domain} has been submitted.</p>
      </div>
      <div class="row-group" style="max-width:420px; margin: var(--space-6) auto 0;">
        <div class="price-decision__row" style="border-top:0;"><div><p class="price-decision__label">Domain</p><p class="price-decision__amount" style="font-size:16px;">${t.domain}</p></div></div>
        <div class="price-decision__row"><div><p class="price-decision__label">Status</p><p style="margin:0;"><span class="status-badge status-badge--premium">\u25cf Transfer pending</span></p></div></div>
        <div class="price-decision__row"><div><p class="price-decision__label">Started</p><p class="price-decision__amount" style="font-size:16px;">${formatDate(t.startedAt)}</p></div></div>
        <div class="price-decision__row"><div><p class="price-decision__label">Estimated completion</p><p class="price-decision__amount" style="font-size:16px;">5\u20137 days</p></div></div>
      </div>
      <p class="taken-domain__dates" style="text-align:center; margin-top: var(--space-4);">Transfer ID: ${t.id}</p>
      <div class="price-decision__actions" style="justify-content:center; margin-top: var(--space-6);">
        ${button({ label: "View my domains" })}
        ${button({ label: "Search another domain", kind: "secondary" })}
      </div>
    </section>
  `;
}

function renderFailedStep() {
  return `
    ${pageIntro()}
    <section class="results-block">
      <p class="results-block__label">We couldn\u2019t complete this transfer</p>
      <p class="taken-domain__dates">The authorization code could not be verified.</p>
      <div class="price-decision__actions" style="margin-top: var(--space-5);">
        ${button({ label: "Try again" })}
        ${button({ label: "Back to my domains", kind: "secondary" })}
      </div>
    </section>
  `;
}

function bindEvents() {
  const domainForm = document.querySelector("#transfer-domain-form");
  if (domainForm) {
    const submitBtn = domainForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    domainForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const result = validateDomainInput(document.querySelector("#transfer-domain-input").value);
      if (result.error) {
        domainError = result.error;
        render();
        document.querySelector("#transfer-domain-input").focus();
        return;
      }
      domainInput = result.value;
      domainError = null;
      step = "checking";
      render();
      window.setTimeout(() => {
        const lower = domainInput.toLowerCase();
        const scenario = transferScenarios[lower];
        if (scenario && scenario.alreadyPending) {
          step = "already-pending";
        } else if (scenario && !scenario.eligible) {
          ineligibleReason = scenario.reason;
          step = "ineligible";
        } else {
          step = "eligible";
        }
        render();
      }, 700);
    });
  }

  if (step === "eligible") {
    const continueBtn = document.querySelector(".results-block .button--primary");
    if (continueBtn) continueBtn.addEventListener("click", () => { step = "requirements"; render(); });
  }

  if (step === "ineligible") {
    const retryBtn = document.querySelector(".results-block .button--primary");
    if (retryBtn) retryBtn.addEventListener("click", () => { resetFlow(); render(); });
    const learnBtn = document.querySelector("#transfer-learn-more");
    if (learnBtn) learnBtn.addEventListener("click", () => { helpOpen = !helpOpen; render(); });
  }

  if (step === "already-pending") {
    const [viewBtn, checkBtn] = document.querySelectorAll(".taken-domain__actions .button");
    if (viewBtn) viewBtn.addEventListener("click", () => { window.location.href = `domains.html?d=${encodeURIComponent(domainInput)}`; });
    if (checkBtn) checkBtn.addEventListener("click", () => { resetFlow(); render(); });
  }

  if (step === "requirements") {
    const [continueBtn, backBtn] = document.querySelectorAll(".price-decision__actions .button");
    if (continueBtn) continueBtn.addEventListener("click", () => { step = "code"; render(); });
    if (backBtn) backBtn.addEventListener("click", () => { step = "domain"; render(); });
  }

  const codeForm = document.querySelector("#transfer-code-form");
  if (codeForm) {
    const toggleBtn = document.querySelector("#transfer-epp-toggle");
    if (toggleBtn) toggleBtn.addEventListener("click", () => {
      eppCode = document.querySelector("#transfer-epp").value;
      codeVisible = !codeVisible;
      render();
      document.querySelector("#transfer-epp").focus();
    });
    const helpBtn = document.querySelector("#transfer-help-toggle");
    if (helpBtn) helpBtn.addEventListener("click", () => {
      eppCode = document.querySelector("#transfer-epp").value;
      helpOpen = !helpOpen;
      render();
    });
    const submitBtn = codeForm.querySelector(".price-decision__actions .button--primary");
    submitBtn.type = "submit";
    codeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = document.querySelector("#transfer-epp").value.trim();
      if (!value) return;
      eppCode = value;
      step = "review";
      render();
    });
    const backBtn = codeForm.querySelector(".price-decision__actions .button--secondary");
    if (backBtn) backBtn.addEventListener("click", () => { step = "requirements"; render(); });
  }

  if (step === "review") {
    const [startBtn, backBtn] = document.querySelectorAll(".checkout-main .price-decision__actions .button");
    if (startBtn) startBtn.addEventListener("click", () => {
      step = isSignedIn() ? "submitting" : "auth-gate";
      render();
      if (step === "submitting") submitTransfer();
    });
    if (backBtn) backBtn.addEventListener("click", () => { step = "code"; render(); });
  }

  const authForm = document.querySelector("#transfer-auth-form");
  if (authForm) {
    const submitBtn = authForm.querySelector(".button--primary");
    submitBtn.type = "submit";
    authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = document.querySelector("#transfer-auth-username").value;
      const password = document.querySelector("#transfer-auth-password").value;
      if (!username.trim() || !password) { errorHelp.hidden = false; errorHelp.textContent = "Email and password required"; if (typeof passwordField !== "undefined") passwordField.focus(); return; } if (false && !checkDemoCredentials(username, password)) {
        document.querySelector("#transfer-auth-error").hidden = false;
        document.querySelector("#transfer-auth-password").focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account\u2026";
      window.setTimeout(() => {
        setSignedIn(true);
        step = "submitting";
        render();
        submitTransfer();
      }, 600);
    });
  }

  if (step === "success") {
    const buttons = document.querySelectorAll(".price-decision__actions .button");
    buttons[0].addEventListener("click", () => { window.location.href = "domains.html"; });
    buttons[1].addEventListener("click", () => { window.location.href = "search.html"; });
  }

  if (step === "failed") {
    const buttons = document.querySelectorAll(".price-decision__actions .button");
    buttons[0].addEventListener("click", () => { step = "code"; render(); });
    buttons[1].addEventListener("click", () => { window.location.href = "domains.html"; });
  }
}

function submitTransfer() {
  window.setTimeout(() => {
    if (eppCode === FAILING_AUTH_CODE) {
      step = "failed";
      render();
      return;
    }
    completedTransfer = addTransferRequest({ domain: domainInput, price: TRANSFER_PRICE, renewalExtension: 1 });
    step = "success";
    render();
  }, 700);
}

render();
initCartDrawer();
initAccountMenu();
