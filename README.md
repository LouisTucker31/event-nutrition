# Race Nutrition

The empty shell of a new app in the same series as the
[triathlon packing list](https://louistucker31.github.io/triathlon-prep/): an
installable web app (PWA) with plain HTML, CSS and JavaScript, and no build step.
It has three pages and a settings pop-up, all blank, with the same floating
glass tab bar and settings button as the triathlon app.

## Structure

```
index.html              the whole app (three pages; settings pop-up)
manifest.webmanifest    install details (name, icons, colours)
sw.js                   service worker: offline support and updates (must stay in the root)
css/styles.css
js/theme.js             applies the saved theme before first paint
js/main.js              app logic: pages, nav, settings pop-up, theme, service worker
js/liquid-glass-nav.js  floating tab bar (unchanged from the triathlon app)
assets/icons/
```

## What works already

- **Pages:** tapping a tab shows its page, moves the glass bubble, scrolls to the
  top and moves focus to the page heading so screen readers announce it. The
  app reopens on the page last used.
- **Settings:** the cog, top right, scrolls away with the page title. It opens a
  full-screen pop-up over everything, including the nav, whose close button
  sits exactly where the cog was. Escape also closes it. The browser tab title
  follows the page, e.g. "Page 2 – Race Nutrition".
- **Theme:** light, dark or system, applied before first paint. There's no
  picker yet; add buttons with `data-theme-choice="light|dark|system"` (as in
  the triathlon app's Appearance section) and `main.js` wires them up.
- **PWA:** installs to the home screen, works offline, checks for an update on
  every resume and reloads to a new version only when the app isn't in use.
- The shared form styles (`.settings-heading`, `.field-group`, `.field`,
  `.field-row`, `.segmented`, `.settings-note`, `.button-danger`, `.confirm`)
  are kept in `styles.css`, ready for page content.

## Before publishing

1. **Name.** Replace "New app" in `index.html` (`<title>`,
   `apple-mobile-web-app-title`), `manifest.webmanifest` and `APP_TITLE` in
   `js/main.js`.
2. **Storage and cache prefix.** Every app on `louistucker31.github.io` shares
   one localStorage and one set of service-worker caches. This app uses the
   prefix `race-nutrition-`. Change it in three places, all to the same new prefix:
   `STORAGE_KEYS` in `js/main.js`, the key in `js/theme.js`, and `PREFIX` in
   `sw.js`. Never use `tri-`, which belongs to the triathlon app.
3. **Tabs.** Rename the tab labels and page headings in `index.html`, and the
   view ids (`view-page1`…) with `VIEWS` in `js/main.js`, keeping the same
   order as the tabs. The tab icons are the triathlon app's (bag, checklist,
   calendar) as placeholders; swap them for Material Symbols Rounded.
4. **Icon.** `assets/icons/icon.svg` and the PNGs are the series background
   with no symbol yet. Add the symbol to the SVG, then regenerate
   `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` (180 × 180) from it.

After changing any file, bump `VERSION` in `sw.js` if you want installed copies
to drop their old cache straight away (they update on next launch either way).

## Data and privacy

Anything the app saves (currently only the theme and the last page used) stays
in this browser's localStorage on this device. No analytics, tracking, cookies
or third-party scripts.

## Security

The site is hosted on GitHub Pages, which serves HTTPS, redirects HTTP to HTTPS
and sends `Strict-Transport-Security`. GitHub Pages does not allow custom
response headers, so:

- **Content Security Policy** is set with a `<meta>` tag in `index.html`. Scripts,
  styles and everything else are limited to this site; images also allow
  `data:` (used by the nav's glass effect); network requests are limited to this
  site. If you add an external service, add it to `connect-src`.
- A meta-tag CSP cannot set `frame-ancestors` and cannot run in report-only
  mode. The referrer policy is also set with a `<meta>` tag.

If the site moves to a host that allows headers (Netlify, Cloudflare Pages and
so on), set these there and remove the meta CSP:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Third-party code

`js/liquid-glass-nav.js` includes the core of
[rizzytoday/liquid-glass](https://github.com/rizzytoday/liquid-glass)
(MIT licence), copied into this repo rather than loaded from a CDN, so there is
no external script to verify with Subresource Integrity. It was reviewed when
added: it builds an SVG filter and a canvas image and makes no network requests.
Nav icons are Google Material Symbols (Apache 2.0), inlined as SVG.
