# Race Nutrition

Race-day fuelling for endurance athletes, a sister app to
[Race Ready](https://louistucker31.github.io/triathlon-prep/): an installable
web app (PWA) with plain HTML, CSS and JavaScript, and no build step. It has the
same floating glass tab bar, settings pop-up and styling as Race Ready, with a
clay accent in place of Race Ready's green.

Live: https://louistucker31.github.io/event-nutrition/

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
- **Settings page**, in this order:
  - *My details:* sex, age, weight and height.
  - *Sweat profile:* how much you sweat compared with others, or a measured
    sweat rate (with a fold-out sweat test that works it out); the six
    salty-sweater signs, which give a saltiness band (0–1 ticked low, 2–3
    average, 4–6 high; worked out as 500, 950 and 1,500 mg/L), or a lab
    sweat-sodium result in mg/L, which overrides them.
  - *Gut training:* the most carbs per hour you're used to, which will cap the
    carb target.
  - *My products:* gels, drink mixes, electrolyte tabs, chews and bars, each
    with carbs and sodium per serving (and the water it's mixed with, for
    drinks and tabs).
  - *Units* (kg, cm or lb, ft in; ml or US fl oz), *Appearance* (light, dark or
    system) and *Clear my details*, which keeps units and appearance.
- **Nutrition and Hydration pages** (first two tabs): display only, for
  whichever workout is selected on the Event page (training or race), with its
  name, type, time and date under the title. The layout is in place; worked-out
  values show "–" until the formulas are added (each is an
  `<output data-result="...">` in `index.html`).
  - *Nutrition:* carbs per hour and in total, a timeline of what to take when,
    servings of each of your products; before (day-before carb loading, the
    pre-workout meal) and after (recovery carbs and protein).
  - *Hydration:* fluid per hour and in total, bottles, sodium per hour and in
    total, what to mix, servings of your drinks and tabs; pre-loading before,
    and how much to drink after.
  - Already live: the event line, the gut limit, the saltiness band and the
    product names, and a "not medical advice" note on both.
- **Event page** (third tab, with Race Ready's calendar icon), laid out like Race Ready's Events page:
  - *Training / Race:* two separate workouts, saved separately. The race stays
    as a reference while the training workout is changed for each session.
    Everything below applies to whichever is showing.
  - *Import from Race Ready* (race only): shown when Race Ready has an event saved in this
    browser (the apps share one localStorage). Brings in the name, date, start
    time, distances, elevation, and paces worked out from the goal times. It
    only reads Race Ready's data.
  - *Details:* name, type (run, bike, swim, triathlon,
    other), date and start time.
  - *Goal* (race): just finish, finish strong, go for a PB or race all out.
  - *Intensity* (training): easy, steady, tempo, race pace or intervals. The interval
    builder (warm-up, reps × work and rest, cool-down) works out the total time
    and a time-weighted overall intensity.
  - *Duration:* a time (one per leg for triathlon), or distance plus pace or
    speed, with the total worked out. Timer-style boxes as in Race Ready.
  - *Conditions:* indoor or outdoor, temperature, humidity and elevation.
  - *Aid stations* (races only): the course drink and gel, picked from My
    products, and a fold-out card per station (leg, km, what it hands out).
  - *Start a new workout* (training) or *Clear this race* clears just that one,
    keeping the other, settings and products.
- **Units:** numbers are stored metric (kg, cm, ml, L/h) and converted for
  display, so switching units back and forth never changes a value.
- **PWA:** installs to the home screen, works offline, checks for an update on
  every resume and reloads to a new version only when the app isn't in use.

## Still to do

- **Formulas** for the Nutrition and Hydration values.
- **Distance and temperature units** are km and °C only for now.

Every app on `louistucker31.github.io` shares one localStorage and one set of
service-worker caches, so this app's keys and caches start with
`race-nutrition-` (`STORAGE_KEYS` in `js/main.js`, the key in `js/theme.js`
and `PREFIX` in `sw.js`). Never use `tri-`, which belongs to Race Ready.

After changing any file, bump `VERSION` in `sw.js` if you want installed copies
to drop their old cache straight away (they update on next launch either way).

## Data and privacy

Everything you enter (your details, sweat profile, gut training, products,
the workout, units and theme) and the last page used stay in this browser's
localStorage on this device. Nothing is sent to a server. Import from Race
Ready reads Race Ready's saved event from the same storage and never changes it. "Clear my details" in settings
removes your details and products. No analytics, tracking, cookies or
third-party scripts.

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
