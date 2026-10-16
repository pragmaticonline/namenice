# Instructions for the AI developer — START HERE

This folder: `INSTRUCTIONS.md` (this file), `HANDOFF.md` (UI spec), `MASCOT.md` (mascot + icons), `mockups/` (3 screens), `logo/` (badger SVG/PNG/ICO files).

Paste the block below into your AI coding agent, with this whole folder in its workspace (or committed to the repo as `design/redesign/`).

---

You are implementing a UI redesign for the namenice repo (https://github.com/pragmaticonline/namenice).

**Read first, in this order:**
1. `HANDOFF.md` in this folder — the spec: design tokens, global rules, per-screen requirements, placeholders, acceptance checklist.
2. `MASCOT.md` and the `logo/` folder — Dig the badger: the logo, favicon, app icons and how to wire them up.
3. `mockups/Main.dc.html`, `mockups/Search.dc.html`, `mockups/Domains.dc.html` — the approved screens. Open them in a browser to see the layout (they need the design runtime to render fully; if they don't render, read the markup — the inline styles are the exact spec). The `<script>` at the bottom of `Search.dc.html` shows the intended add-to-cart toggle behaviour.
4. In the repo: `CONTEXT.md` (domain language), `src/index.ts` (`shell()`, `GET /`, `GET /search`, `/domains`), `public/assets/css/*.css`, `public/assets/js/search.js`, `state.js`, `cart-drawer.js`, `domains.js`.

**Do the work in this order, one PR (or commit) per step:**
1. **Tokens + fonts.** Replace values in `public/assets/css/tokens.css` per HANDOFF §1 and swap the Google Fonts link in `shell()`. Run the app and confirm nothing breaks visually beyond the colour/type change.
2. **Shared shell + mascot.** Do every task in `MASCOT.md` (favicon, app icons, manifest, badger logo in `wordmarkHtml()`). New nav (marketing nav for signed-out, app nav for signed-in) and footer in `shell()`. Buttons, chips, status pills, cards as reusable CSS classes in `base.css` — no inline styles in templates.
3. **Home** (`GET /`) — rebuild `homepageBody` to match `Main.dc.html`.
4. **Search** (`GET /search`) — rebuild to match `Search.dc.html`: exact-match card, multi-TLD results list with filters, suggestion chips, persistent cart panel. Extend the server/`/api/search` to return several TLDs for one query. Wire Add/Remove to `state.js`.
5. **Domains** (`GET /domains`) — summary cards + table per `Domains.dc.html`, using real data.
6. **Mascot moments** — add Dig to empty states and the 404 page per `MASCOT.md` §5.
7. **Clean up** — delete CSS no longer used (`homepage.css` hero diagonal, tech-grid, etc.).

**Rules:**
- Keep all existing behaviour: auth, Stripe checkout, balance, transfers, favorites, history. This is a visual/UX change, not a backend rewrite.
- Escape all user input with the existing `esc()` helper. Do not weaken any test.
- Run `npm test` after every step; all tests in `test/` must pass. Update selectors in tests only when the markup intentionally changed, and say so in the commit.
- Every page must work at 390px and 1440px wide. Touch targets ≥ 44px, text contrast ≥ 4.5:1, visible keyboard focus, real `<button>`/`<a>`/`<label>` elements.
- Items listed in HANDOFF §4 (Make offer, provider presets, Apple Pay, "Points to" detection) are **not** in the backend. Don't fake them: either leave them out or put them behind a clearly named feature flag, and list what you skipped.
- Sample names/prices in the mockups are placeholders — always render real data.
- If something in the mockup conflicts with existing behaviour or the backend can't support it, stop and ask rather than guess.

**When done**, report: what changed per screen, screenshots at 390px and 1440px, test results, and anything from HANDOFF §5 or MASCOT.md "Done when" that is not yet ticked.
