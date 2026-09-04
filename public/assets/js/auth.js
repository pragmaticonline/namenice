import { button, wordmark } from "./components.js";
import { checkDemoCredentials, setSignedIn } from "./state.js";

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
      <p class="auth-panel__lede" style="margin-top:-8px;">Demo login: username <strong>namenice</strong>, password <strong>1234</strong>.</p>

      <form class="auth-form" id="auth-form" novalidate>
        <div class="field-group">
          <label class="field-label" for="auth-username">Username</label>
          <input class="field" type="text" id="auth-username" placeholder="Enter your username" autocomplete="username" required />
        </div>
        <div class="field-group">
          <label class="field-label" for="auth-password">Password</label>
          <input class="field" type="password" id="auth-password" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
          <p class="field-help" id="auth-error-help" style="color: var(--color-error);" hidden>Incorrect username or password.</p>
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

      <p class="auth-note" id="auth-status">This is a presentation demo \u2014 the only working login is the demo account above.</p>
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!checkDemoCredentials(usernameField.value, passwordField.value)) {
      errorHelp.hidden = false;
      passwordField.focus();
      return;
    }
    errorHelp.hidden = true;

    submitButton.disabled = true;
    submitButton.textContent = isSignup ? "Creating account\u2026" : "Signing in\u2026";
    status.textContent = "Presentation demo \u2014 nothing was actually submitted.";

    window.setTimeout(() => {
      setSignedIn(true);
      window.location.href = nextUrl;
    }, 900);
  });
}

render();
