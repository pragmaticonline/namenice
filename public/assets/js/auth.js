import { button, wordmark } from "./components.js";

const app = document.querySelector("#app");
const mode = app.dataset.mode === "signup" ? "signup" : "signin";
const isSignup = mode === "signup";
const defaultUrl = isSignup ? "index.html" : "domains.html";
const nextUrl = new URLSearchParams(window.location.search).get("next") || defaultUrl;

function render() {
  app.innerHTML = `
    <nav class="site-nav">
      <a href="index.html" class="wordmark">${wordmark()}</a>
      <div class="site-nav__links">
        <a href="index.html">Home</a>
        <a href="${isSignup ? "signin.html" : "signup.html"}">${isSignup ? "Sign in" : "Create account"}</a>
      </div>
    </nav>

    <section class="auth-panel">
      <h1 class="auth-panel__heading">${isSignup ? "Create your account" : "Sign in to namenice"}</h1>
      <p class="auth-panel__lede">${
        isSignup
          ? "Search stays free forever. An account is only needed for buying, DNS, and billing."
          : "Welcome back \u2014 sign in to manage your domains."
      }</p>
      <p class="auth-panel__lede" style="margin-top:-8px; color: var(--color-text-secondary); font-size: 13px;">Secure auth via Better Auth — HttpOnly session cookie.</p>

      <form class="auth-form" id="auth-form" novalidate>
        <div class="field-group">
          <label class="field-label" for="auth-username">Email address</label>
          <input class="field" type="email" id="auth-username" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="field-group">
          <label class="field-label" for="auth-password">Password</label>
          <input class="field" type="password" id="auth-password" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
          <p class="field-help" id="auth-error-help" style="color: var(--color-status-error);" hidden>Incorrect email or password.</p>
        </div>
        ${button({ label: isSignup ? "Create account" : "Sign in" })}
      </form>

      <div class="auth-divider">or continue with</div>
      <div class="auth-oauth">
        ${button({ label: "Google", kind: "secondary" })}
        ${button({ label: "GitHub", kind: "secondary" })}
      </div>

      <p class="auth-switch">
        ${isSignup ? "Already have an account?" : "New to namenice?"}
        <a href="${isSignup ? "signin.html" : "signup.html"}">${isSignup ? "Sign in" : "Create an account"}</a>
      </p>

      <p class="auth-note" id="auth-status">Secure auth via Better Auth. Session cookie is HttpOnly.</p>
    </section>
  `;
  bindEvents();
}

function bindEvents() {
  const form = document.querySelector("#auth-form");
  const submitButton = form.querySelector(".button--primary");
  submitButton.type = "submit";
  const status = document.querySelector("#auth-status");
  const usernameField = document.querySelector("#auth-username");
  const passwordField = document.querySelector("#auth-password");
  const errorHelp = document.querySelector("#auth-error-help");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = usernameField.value.trim();
    const password = passwordField.value;
    if (!email || !password) { errorHelp.hidden = false; errorHelp.textContent = "Email and password required"; return; }
    errorHelp.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = isSignup ? "Creating account\u2026" : "Signing in\u2026";
    status.textContent = "";
    try {
      const url = isSignup ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const body = isSignup ? { email, password, name: email.split("@")[0] } : { email, password };
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { errorHelp.textContent = j.message || j.error || "Failed: " + r.status; errorHelp.hidden = false; submitButton.disabled = false; submitButton.textContent = isSignup ? "Create account" : "Sign in"; return; }
      status.textContent = "Success \u2014 redirecting\u2026";
      status.style.color = "var(--color-status-success)";
      window.location.href = nextUrl;
    } catch (e) { errorHelp.textContent = String(e.message || e); errorHelp.hidden = false; submitButton.disabled = false; }
  });
}

render();
