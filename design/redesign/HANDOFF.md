# namenice UI redesign — implementation handoff

Repo: https://github.com/pragmaticonline/namenice (Hono on Cloudflare Workers; pages are server-rendered strings in `src/index.ts`, styles in `public/assets/css/`, client JS in `public/assets/js/`).

`mockups/` holds the three approved screens as HTML. They use a small templating runtime (`<x-dc>`, `{{holes}}`, `<sc-for>`, `<sc-if>`) — treat them as **visual + behavioural reference**, not code to paste. Port the markup into the existing `shell()` / route templates and move inline styles into CSS classes.

| Mockup | Route | Current template |
|---|---|---|
| `mockups/Main.dc.html` | `GET /` | `homepageBody` in `src/index.ts` |
| `mockups/Search.dc.html` | `GET /search` | `searchBody` in `src/index.ts` + `public/assets/js/search.js` |
| `mockups/Domains.dc.html` | `GET /domains` | domains page + `public/assets/js/domains.js` |

## 1. Design tokens — replace `public/assets/css/tokens.css`

Keep variable *names* where possible so existing CSS keeps working; change values.

```css
:root {
  /* surfaces */
  --color-surface-primary: #F7F7F4;   /* page background (warm off-white) */
  --color-surface-raised:  #FFFFFF;   /* cards, panels, inputs */
  --color-surface-dark:    #111418;   /* dark band, primary nav button */
  --color-surface-dark-2:  #1C2028;   /* card inside dark band */
  /* text */
  --color-text-primary:   #111418;
  --color-text-secondary: #4A5262;
  --color-text-muted:     #5B6372;    /* captions; keeps >=4.5:1 on white */
  --color-text-disabled:  #8A909C;    /* taken domains */
  /* borders */
  --color-border-subtle: #E4E6EB;
  --color-border-strong: #DCDFE6;     /* inputs, chips */
  --color-divider:       #F0F1F4;     /* row separators */
  /* action — ONE accent for every primary action */
  --color-action-primary:         #2F54EB;
  --color-action-primary-hover:   #1D3BC4;
  --color-action-primary-surface: #E9EDFF;
  /* brand nod — use sparingly (cart count badge, CTA on dark band) */
  --color-brand-expression: #C6F36B;
  /* status — only for state, never decoration */
  --color-status-success:         #0F6A3A;
  --color-status-success-surface: #E3F6EA;
  --color-status-success-border:  #BDE5CB;
  --color-status-warning:         #8A4B00;
  --color-status-warning-surface: #FFF4E5;
  --color-status-warning-border:  #F5D9A8;
  /* type */
  --font-display: "Bricolage Grotesque", system-ui, sans-serif; /* weights 500/700 */
  --font-ui: "Geist", system-ui, sans-serif;                    /* weights 400/500/600 */
  /* radius */
  --radius-control: 12px;  /* buttons, inputs */
  --radius-card:    20px;  /* panels */
  --radius-band:    28px;  /* dark pricing band */
  --radius-pill:    999px; /* chips, badges, nav CTA */
  --shadow-search: 0 12px 40px rgb(17 20 24 / 8%);
}
```

Fonts (replace the IBM Plex / Newsreader link in `shell()`; keep the Thai fallbacks if Thai copy is still needed):
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Geist:wght@400;500;600&display=swap`

Type scale: hero h1 `clamp(44px,7vw,88px)` / line-height .98 / letter-spacing -.035em; section h2 36–44px; page h1 40px; body 15–17px; captions 13–14px. Headings use `--font-display`, everything else `--font-ui`.

## 2. Global rules

- Logo: Dig the badger mark + wordmark `namenice` with the full stop in `--color-action-primary` (see `MASCOT.md`).
- Max content width 1200px, 24px side gutter. Everything must work at phone width (flex-wrap / auto-fit grids; tables in an `overflow-x:auto` box).
- Touch targets ≥ 44px. Primary buttons 52–56px tall.
- One primary (blue, filled) action per view region. Secondary = white with border. Tertiary = text link.
- "In cart" state everywhere = green surface + green text + "Added ✓" (never disable silently).
- No emoji, no gradients.

## 3. Screens

### Home (`/`)
- Nav: wordmark · Pricing · Transfer · Sign in · **Get started** (dark pill). Signed-in: replace the last two with the account menu + cart.
- Hero (centred): extension pill → h1 "Find a name worth owning." → subhead → **single search box** (white, 20px radius, shadow) with blue Search button → popular-search chips → trust line "Free to search · No account needed · WHOIS privacy included".
- The box accepts either a full domain (`sunrise.com`) or a free-text idea (`sunrise bakery`) and goes to `/search?q=`.
- "Search → Pick → Own it" 3-card row.
- Dark pricing band: first-year and renewal price shown side by side, lime CTA.
- 4 short benefit cards. Footer.
- Removes: the diagonal hero, value-list, dark tech grid and the fake management panel (too much text for a customer page — move dev details to a /developers page).

### Search (`/search?q=`)
- Compact top bar: wordmark · search input (prefilled) · dark Cart pill with lime count.
- Two columns (stack on mobile): results left, **persistent cart panel right** (replaces opening the cart drawer just to see what you added).
- **Exact match card**: blue 2px border, status pill, domain at 44px, renewal line, price, big Add to cart.
- **Other extensions list**: query checked across all supported TLDs at once (today only one result is shown and `.net` is assumed). Filter chips: All / Available only / Under $20. Each row: name · status · price + "renews same" · Add toggle. Taken rows are greyed and show "Make offer" (or hide the action if offers are not supported).
- **Ideas like this**: available alternatives as one-tap chips (wire to `nameSuggestionGroups` / Dynadot suggestions).
- Cart panel: items, total, Checkout button, "Card, Apple Pay or account balance".
- Add is a toggle (click again to remove); the cart count and total update instantly. Reference behaviour is in the `<script>` of `Search.dc.html` (`toggle()` / `renderVals()`); wire it to `addToCart` / `removeFromCart` in `state.js`.

### Your domains (`/domains`)
- App nav: Domains (active) · Billing · Team · Developers · avatar.
- Header "Your domains" + count/health line; actions Transfer in (secondary) and **+ New domain** (primary).
- Three summary cards: Balance (+ Top up), Next renewal (+ whether balance covers it), **Needs attention** (amber, only when something is wrong — e.g. a domain with no DNS records).
- Table: Domain · Status pill (Live / Not connected / Parked) · **Points to** in plain language (provider name or "Redirect → x") · Renews (amber if < 30 days) · Auto-renew · Manage/Connect.

## 4. Placeholders / not-yet-built
- All domain names, prices and dates in mockups are sample data.
- "Make offer", one-click provider presets (Vercel/Shopify/Squarespace/Google Workspace), Apple Pay, and "Points to" provider detection are **proposals** — not in the backend today. Build behind flags or omit.
- "300+ extensions" copy must match what Dynadot/pricing actually supports.

## 5. Acceptance checklist
- [ ] tokens.css replaced, fonts swapped, no old orange/teal/lime-on-sage left in UI
- [ ] Home, Search, Domains match mockups at 1440px and 390px wide
- [ ] Search shows multiple TLDs + suggestions; Add toggles; cart panel live-updates
- [ ] All existing tests in `test/` still pass (esp. `browser-regressions`, `checkout`, `auth-xss` — keep `esc()` on all user input)
- [ ] Text contrast ≥ 4.5:1; keyboard focus visible on every control
