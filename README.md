# Flavour Frequency — landing page

One-page launch site for **Flavour Frequency** (*Food · Music · Culture*): Home, Menu, Find us,
About, and the "Stay on frequency" signup. Built from the
[Flavour Frequency Design System](https://claude.ai/design/p/4743edb1-f317-4241-856a-94c4b5df593b)
(`ui_kits/web` mockup) as a static, dependency-free site for **Cloudflare Pages**.

- Plain HTML / CSS / vanilla JS — no build step, no framework, no runtime dependencies
- Self-hosted fonts (Anton, Oswald, Archivo — SIL OFL) — no third-party requests at all
- Responsive AVIF / WebP / JPEG images generated from the brand originals
- Strict security headers + CSP (`_headers`), cached assets, `robots.txt`, `sitemap.xml`, OG / Twitter cards, JSON-LD
- Lighthouse 100 / 100 / 100 (Accessibility, Best Practices, SEO) on desktop and mobile
- Motion: staggered hero reveal, EQ bars, tilted marquee ticker, scroll reveals, menu filter transitions,
  pulsing map pin, Carnival countdown sticker, rotating badge ring, poster lightbox — all respecting
  `prefers-reduced-motion`

## Project layout

```
index.html            the page
styles.css            tokens (ported from the design system) + components + sections
main.js               nav, scroll-spy, reveals, filters, lightbox, countdown, signup
assets/               optimised images, favicons, OG image, grain tile
fonts/                latin-subset WOFF2 + licence notes
functions/api/        Cloudflare Pages Function: POST /api/subscribe
_headers              security + caching headers (Cloudflare Pages)
robots.txt  sitemap.xml  site.webmanifest
```

## Local preview

Any static server works (absolute paths aren't used):

```bash
python3 -m http.server 8787
```

Then open <http://localhost:8787>. (`/api/subscribe` only exists on Cloudflare — locally the form shows
its mailto fallback, which is the intended behaviour when the endpoint isn't available.)

## Deploying on Cloudflare Pages

The project is already connected to this repo. Settings to use:

| Setting | Value |
|---|---|
| Framework preset | **None** |
| Build command | *(leave empty)* |
| Build output directory | `/` |
| Production branch | `main` |

Every push to `main` deploys. `functions/` is picked up automatically as Pages Functions, and
`_headers` is applied at the edge.

Custom domain: `flavourfrequency.com` is referenced in the canonical / OG / sitemap URLs — attach it
under **Custom domains** in the Pages project (DNS already points at Cloudflare).

### Wiring up the signup form

`POST /api/subscribe` validates the email (plus a honeypot) and then stores/forwards it. It needs
**one** of these configured in the Pages project, otherwise it returns `501` and the page falls back
to a mailto link so nothing is lost silently:

1. **KV (simplest)** — Workers & Pages → KV → create a namespace (e.g. `flavour-frequency-subscribers`),
   then Pages project → *Settings → Bindings → KV namespace* → variable name **`SUBSCRIBERS`**.
   Signups are stored as `sub:<email>` → `{ email, updates, source, country, ts }`.
   Export any time with `wrangler kv key list --namespace-id=<id>` or from the dashboard.
2. **Webhook** — Pages project → *Settings → Variables* → **`SUBSCRIBE_WEBHOOK_URL`** = an `https://`
   endpoint (Zapier / Make / Mailchimp / your CRM). The same JSON record is POSTed to it.

Both can be enabled together. Redeploy (or retry the deployment) after adding bindings.

## Editing content

- **Menu** — the cards in `index.html` under `<!-- MENU -->`. Each item carries
  `data-tags="caribbean|asian|latin spicy|vegan"` which drives the filter chips.
- **Carnival dates / countdown** — `CARNIVAL_START` / `CARNIVAL_END` in `main.js`, the dates in the
  hero sticker, the *Our stand* facts, and the `FoodEvent` JSON-LD in `index.html`.
  The sticker switches to "We're live" during the event and "That's a wrap" afterwards.
- **Stand location copy, socials, email** — `index.html` (Find us section and footer).
- **Colours, type, spacing** — the `:root` tokens at the top of `styles.css` mirror
  `tokens/*.css` in the design system.

## Assets

Everything in `assets/` is derived from the five brand originals in the design system's `uploads/`
folder (`logo.png` wordmark, `FF-LOGO.png` badge, `Banner-FF.jpg`, `menu.jpeg`, `map.jpeg`).
If you replace an image, rename the file (e.g. `banner-1600-v2.jpg`) — `assets/*` is cached for
30 days at the edge and in browsers. Fonts are cached for a year (immutable).

Brand artwork © Flavour Frequency. Fonts: see `fonts/LICENSE.md`.
