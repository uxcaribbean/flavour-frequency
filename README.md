# Flavour Frequency — landing page

One-page launch site for **Flavour Frequency** (*Food · Music · Culture*): Home, Menu, Find us,
About, and the "Stay on frequency" signup. Built from the
[Flavour Frequency Design System](https://claude.ai/design/p/4743edb1-f317-4241-856a-94c4b5df593b)
(`ui_kits/web` mockup) as a static, dependency-free site for **Cloudflare Workers** (static assets).

- Plain HTML / CSS / vanilla JS — no build step, no framework, no runtime dependencies
- Self-hosted fonts (Anton, Oswald, Archivo — SIL OFL) — no third-party requests at all
- Responsive AVIF / WebP / JPEG images generated from the brand originals
- Google Tag Manager (`GTM-NWVR6VDZ`) on every page, plus a `/privacy` policy page (GetTerms embed)
- Security headers + CSP (`_headers`), cached assets, `robots.txt`, `sitemap.xml`, OG / Twitter cards, JSON-LD
- Lighthouse 100 / 100 / 100 (Accessibility, Best Practices, SEO) on desktop and mobile
- Motion: staggered hero reveal, EQ bars, tilted marquee ticker, scroll reveals, menu filter transitions,
  pulsing map pin, Carnival countdown sticker, rotating badge ring, poster lightbox — all respecting
  `prefers-reduced-motion`

## Project layout

```
index.html            the landing page
privacy.html          privacy policy (GetTerms embed), served at /privacy
styles.css            tokens (ported from the design system) + components + sections
main.js               nav, scroll-spy, reveals, filters, lightbox, countdown, signup
assets/               optimised images, favicons, OG image, grain tile
fonts/                latin-subset WOFF2 + licence notes
functions/api/        the /api/subscribe handler (imported by worker.js)
worker.js             Worker entry: routes /api/subscribe, falls through to assets
wrangler.jsonc        deploy config (Worker "flavour-frequency" + static assets)
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

## Deploying on Cloudflare (Worker + static assets)

The project deploys as a **Cloudflare Worker with static assets** — not a Pages project. Every
push to `main` builds and deploys via the Worker's git integration.

- `wrangler.jsonc` is the deploy config: Worker name `flavour-frequency`, `main: worker.js`,
  assets served from the repo root. The name must match the Worker in the dashboard.
- `worker.js` runs only for requests that don't match a static asset: it serves
  `POST /api/subscribe` (importing the handler from `functions/api/subscribe.js`) and passes
  everything else to the assets binding for a 404.
- `.assetsignore` keeps repo internals (README, tests, the worker source, this config) from
  being uploaded as public assets.
- `_headers` still applies to static asset responses. API responses set their own headers.
- If a deploy serves the site but `/api/subscribe` returns 404, check the Worker's build
  settings: the deploy command must be plain `npx wrangler deploy` — an explicit `--assets`
  flag would bypass `main` and deploy assets only.

Custom domain: `flavourfrequency.com` is attached to the Worker (the canonical / OG / sitemap
URLs reference it).

### Wiring up the signup form (SureContact)

The mailing list lives in **SureContact**. The page keeps its own form and POSTs to
`/api/subscribe` — handled by the Worker (`worker.js` → `functions/api/subscribe.js`), i.e. server-side. That matters: a static page has no server, so
an API key in client-side JS would be readable by anyone. The credential never leaves the Worker.

> The SureContact-hosted form was considered and rejected: it is a page on `app.surecontact.com`, so
> embedding means an **iframe**, and CSS cannot cross an iframe boundary — it could not be made to
> match the site. The form API exposes no styling options either (`name`, `description`, `fields`,
> `slug` only).

Set **any** of these in the Pages project. With none set the endpoint returns `501` and the page
falls back to a mailto link, so signups are never silently dropped:

| Variable | Where | What it does |
|---|---|---|
| `SC_API_KEY` | Worker → *Settings → Variables and Secrets* — type **Secret** | Upserts the contact and sets tag, list and consent timestamp. Richest option. |
| `SC_WEBHOOK_URL` | Worker → *Settings → Variables and Secrets* — type **Secret** | An automation's Incoming Webhook URL. No key; starts the automation directly. |
| `SUBSCRIBERS` | KV binding — declare it in `wrangler.jsonc` (see below) | Durable local copy, written first so a SureContact outage can't lose a signup. |
| `SC_CONTACT_STATUS` | Worker → *Settings → Variables and Secrets* — type Text (optional) | `active` (default) or `pending` to require double opt-in. |

Secrets survive every deploy, and `keep_vars: true` preserves dashboard-added text variables
too. **KV is the exception**: on a git-connected Worker, `wrangler.jsonc` is the source of
truth for bindings, so a KV binding added only in the dashboard is dropped on the next push.
To enable it, create the namespace (**Storage & Databases → KV**), then declare it:

```jsonc
"kv_namespaces": [{ "binding": "SUBSCRIBERS", "id": "<namespace id>" }]
```

Adding a secret in the dashboard takes effect immediately — it deploys a new version of the same code, no push needed.

#### Workspace UUIDs

SureContact keys tags and custom fields by **UUID, not name**, so these are hard-coded in
`functions/api/subscribe.js` (in the `SC` constant, with the human names in comments). They are
specific to this workspace:

| Thing | Name | UUID |
|---|---|---|
| Tag | `newsletter-subscribed` | `8495b510-be54-4df0-92b0-17cb732c03a2` |
| List | `Newsletter` | `ec4e7e9f-5749-44fa-8c07-661bb8aa59ac` |
| Custom field | `consent_timestamp` ("Consent given at") | `e91857ed-3894-4fd1-908d-2e0dcc13b3fb` |

If you rebuild the workspace, update that constant or contacts will be created untagged.

#### Consent

The "Send me event drops & menus" box is unticked by default (a pre-ticked box is not consent under
UK GDPR, and is a banned practice under the DMCC Act). It is **required** — submitting without it
returns a clear message rather than storing an address there is no permission to email. The moment
of consent is recorded on the contact as `consent_timestamp`.

Emails, sequences and templates all live in SureContact — the site only submits the contact. If a
welcome email doesn't arrive, the answer is in the automation config, not in this repo.

**Erasure:** a "delete everything about me" request has to reach SureContact too, not just KV.
There is no public endpoint for this by design; delete the contact from the SureContact dashboard
(or via its MCP connector) and remove the matching `sub:<email>` key from KV.

#### Tests

`test/subscribe.test.mjs` covers the Function against a mocked SureContact and KV — the honeypot,
validation, the consent gate, the request shape (route, `X-API-Key` not `Bearer`, UUIDs), and the
failure modes. No network and no key needed:

```bash
node test/subscribe.test.mjs
```

## Analytics & privacy policy

**Google Tag Manager** — container `GTM-NWVR6VDZ`. The `<head>` snippet sits as high as possible on
both `index.html` and `privacy.html`, with the `<noscript>` iframe immediately after `<body>`.
Add a page to the site → copy both snippets across, or GTM won't fire there.

**Privacy policy** — `privacy.html` hosts the GetTerms embed (account `oK14B`, document `privacy`).
The policy text is edited in the GetTerms dashboard, not in this repo; the page only supplies the
brand shell and the styling for the injected markup (`.legal__body` in `styles.css`). The embed
repeats the document title as an `<h1>`, which is hidden so the page keeps a single heading.
Cloudflare Pages serves it at the clean URL **`/privacy`**, which is what the footer links to.

### CSP note

Adding GTM and GetTerms required loosening the Content-Security-Policy in `_headers`:

- `script-src` now allows `'unsafe-inline'` plus `googletagmanager.com` and `gettermscdn.com`.
  GTM needs `'unsafe-inline'` — its container injects inline scripts, and any Custom HTML tag you
  add in the GTM UI would otherwise be silently blocked. This is the standard trade-off for
  running GTM; the alternative (nonces) breaks as soon as someone adds a tag in the dashboard.
- `frame-src` allows both hosts: the GTM `<noscript>` iframe, and GetTerms — which uses a hidden
  iframe to fetch the document even in `mode="direct"`.
- `img-src` / `connect-src` allow Google Analytics endpoints so GA4 tags fired through GTM work.

If a tag ever fails to fire, check the browser console first — a CSP violation names the exact
directive and host to add.

**Cookie consent:** GTM/GA4 set analytics cookies. Under UK GDPR/PECR those need consent *before*
they fire, so a consent banner (GTM's Consent Mode, or a CMP) is the missing piece before this
counts as compliant — the privacy policy alone doesn't cover it.

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
