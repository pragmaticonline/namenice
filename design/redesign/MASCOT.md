# namenice mascot: Dig the badger — implementation instructions

Part of the namenice handoff — read `INSTRUCTIONS.md` first. Asset files are in `logo/`. Repo: https://github.com/pragmaticonline/namenice

## The mascot
**Dig** is a badger. Badgers dig — and `dig` is the classic command for looking up a domain's DNS. Dig digs up a good name for you and keeps your DNS in order. His **blue nose is the "." of the wordmark** (`namenice.` — brand blue `#2F54EB`), tying the mascot to the logo and to domain names.

| Colour | Hex | Use |
|---|---|---|
| Badger grey | `#AEB4BE` | outer cheeks |
| Stripe ink | `#1E2228` | eye stripes, ears |
| White | `#FFFFFF` | centre stripe, ear rims, eyes |
| Ink | `#111418` | pupils |
| Brand blue | `#2F54EB` | nose (= the wordmark dot); app-icon background |

## Files in `logo/`
| File | Use |
|---|---|
| `badger-mark.svg` | The logo. Header, footer, empty states. Also `badger-mark-512.png` (transparent). |
| `favicon.svg` | Simplified badger (bolder stripes and eyes) for browser tabs. |
| `favicon.ico` | 16/32/48 fallback for old browsers. Also `favicon-16.png`, `favicon-32.png`, `favicon-48.png`. |
| `app-icon.svg` | Badger on a brand-blue rounded square (nose turns ink there). Also `app-icon-512.png`, `app-icon-192.png`, `apple-touch-icon.png` (180px). |

## Tasks
1. **Copy assets.** Put everything from `logo/` in `public/brand/` (served by the existing static asset handler — confirm in `wrangler.jsonc`, same as `public/assets/`).
2. **Head tags.** In `shell()` in `src/index.ts`, add inside `<head>`:
   ```html
   <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
   <link rel="icon" href="/brand/favicon.ico" sizes="any">
   <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
   <link rel="manifest" href="/site.webmanifest">
   <meta name="theme-color" content="#2F54EB">
   ```
   Also add `<link rel="icon" href="/brand/favicon.ico">` at `/favicon.ico` (a route or static file) because browsers request that path directly.
3. **Manifest.** Serve `/site.webmanifest`:
   ```json
   {"name":"namenice","short_name":"namenice","start_url":"/","display":"standalone",
    "background_color":"#F7F7F4","theme_color":"#2F54EB",
    "icons":[{"src":"/brand/app-icon-192.png","sizes":"192x192","type":"image/png"},
             {"src":"/brand/app-icon-512.png","sizes":"512x512","type":"image/png"}]}
   ```
   Content-Type `application/manifest+json`.
4. **Logo in the header.** Update `wordmarkHtml()` (used by nav and footer) to render `badger-mark.svg` inline (or as `<img alt="">`) at **36px** (32px under 600px wide), 10px gap, then the live-text wordmark `namenice` + blue `.` in Bricolage Grotesque 700, letter-spacing -0.02em. The link keeps `aria-label="namenice home"`. On the dark band/footer, use the mark unchanged with white text.
5. **Mascot moments** (small, optional, not on every screen):
   - Search with no results / invalid domain: Dig at 96px above the message.
   - Empty cart and empty domain list: Dig at 96px with one friendly line ("Nothing here yet — let's find you a name.").
   - 404 page: Dig at 120px.
6. **Social image (still to make).** `og:image` 1200×630: page background `#F7F7F4`, Dig at ~280px on the left, wordmark and the line "Find a name worth owning." on the right. Add `og:image` and `twitter:card=summary_large_image` to `shell()`.

## Rules
- Keep the mascot in **one shared component** (`wordmarkHtml()` / a `badgerMark()` helper) so a refined drawing can replace it later without touching pages.
- Do not recolour, rotate, stretch, crop or add outlines/shadows. Keep clear space of ¼ the mark's width around it.
- Decorative uses get `alt=""`/`aria-hidden="true"`; don't announce the badger twice next to the wordmark.
- Never use the mascot as a loading spinner or put text inside it.

## Done when
- Tab shows the badger favicon in Chrome, Safari, Firefox (light and dark tab bars).
- "Add to Home Screen" on iOS/Android shows the blue app icon.
- Header shows badger + wordmark on every page at 1440px and 390px.
- `npm test` passes.
