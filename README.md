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
  - *My details:* sex, age, weight and height, and (optional) normal daily
    carbs, so carb loading can show the increase.
  - *Sweat profile:* how much you sweat compared with others (base rates of
    0.5, 0.9 and 1.3 L/h at about 18 °C and a steady effort), or a measured
    sweat rate with the temperature, sport and effort it was measured at (the
    fold-out sweat test works it out and copies its conditions over); the six
    salty-sweater signs, which give a saltiness band (0–1 ticked low, 2–3
    average, 4–6 high; worked out as 500, 950 and 1,500 mg/L), or a lab
    sweat-sodium result in mg/L, which overrides them.
  - *Gut training:* the most carbs per hour you're used to, which will cap the
    carb target. Left empty, the plan follows the standard guidance with no cap
    (`gutCarbCap()` returns null), and the Nutrition page says so. Below it,
    how many hours before the start you eat your pre-race meal (1–4, default 2).
  - *My products:* gels, drink mixes, electrolyte tabs, chews and bars, each
    with carbs, sodium and caffeine per serving (and the water it's mixed
    with, for drinks and tabs), carb type (glucose only or glucose +
    fructose), and an optional daily limit from the label.
  - *Bike bottles:* bottle size and how many you carry (e.g. 2 × 750 ml),
    used on the bike only; the run's handheld or vest is set per event.
  - *Units* (kg, cm or lb, ft in; ml or US fl oz) and *Appearance* (light,
    dark or system).
  - *Reset:* *Clear my details* clears your details, sweat profile and gut
    training, keeping products, bottles, units and appearance (products and
    bottles are kit you keep between races). *Remove all products* clears the
    products on their own.
- **Nutrition and Hydration pages** (first two tabs): display only, for
  whichever workout is selected on the Event page (training or race), with its
  name on one line and Race / Training, time and date below it. Each worked-out
  value is an `<output data-result="...">` in `index.html`.
  - *Nutrition* (worked out, see the constants and comment above `carbPlan`
    in `js/main.js`):
    - Carbs per hour from the guidance for the session length: none under 45
      min, 0–30 g/h to 75 min, 30–60 g/h to 2 h 30, 60–90 g/h to 4 h, and over
      4 h 60–90 g/h (90 only with a glucose + fructose product). Capped at 60
      g/h when every carb product is glucose only, and by gut training; the
      guidance line shows the caps side by side, with the gap. Total carbs
      over the time you can eat (none on a swim; bike and run in a triathlon).
    - Timeline of real feeds: the first gel or chew in My products (or a 22 g
      gel), at the top of the capped target less any drink-mix carbs in the
      hydration plan. The first is 15 minutes before the start; then one every
      carbs ÷ rate (to the nearest 5 min), stopping under 20 minutes from the
      finish or within half a serving of the total. Triathlon feeds go only
      in the bike and run (one due in the swim moves to the bike start). Each
      row has a running total; the product's daily limit is respected.
      Example: a 2:06:36 run at a 30 g/h cap with a 22 g gel gives −0:15,
      0:30 and 1:15, 3 gels, 66 g.
    - Total carbs shows the target beside what's planned, e.g. "65 g target ·
      66 g planned (3 gels)". Feeds keep out of the last 30 minutes; when the
      last is 45+ minutes before the finish, a note says why.
    - "From your products" shows servings from the timeline (e.g. "3
      servings, 66 g"); anything unused says "Not in this plan".
    - Carb loading, per day with kcal: 7–8 g/kg the day before (90 min–2 h 30,
      marked optional: a carb-heavy dinner is often enough), 8–10 g/kg a day
      for 36 hours (2 h 30–4 h), 10–12 g/kg a day for 36–48 hours (over 4 h).
      With normal daily carbs set, the main line is the increase ("About
      +295–400 g on top of a normal day"), with the total beneath. Split into
      3 meals and 2 snacks, keeping fibre and fat lower.
    - Pre-race meal: 1 g/kg up to 1 g/kg for each hour before (at most 4
      g/kg), eaten the hours before set in Settings (default 2); runs go for
      the lower end. E.g. 103 kg, 2 h before a 09:30 start: eat by 07:30,
      105–205 g. An example meal near the low end is built from bagels, jam,
      banana and honey, with a list of foods' approximate carbs (`MEAL_FOODS`).
    - Caffeine (optional, only when a product has caffeine): 1–3 mg/kg about
      60 minutes before the start, in mg and servings of that product.
    - Recovery: 1.0–1.2 g/kg of carbs an hour and about 0.3 g/kg of protein,
      stressed ("within 30 min") only when training again within 8 hours.
  - *Hydration* (worked out, see the constants above `renderHydration` in
    `js/main.js`):
    - Sweat rate for the event: your measured rate or sweat level, scaled for
      temperature, humidity, indoors, effort and sport (`SWEAT_SCALING`: these
      factors are starting assumptions, not from a source).
    - Target from need, not a ceiling: need (L/h) = max(0, S × T − 0.02 × W) ÷ T,
      keeping loss to about 2% of body weight; capped at 0.8 L/h on the run and
      1.0 L/h on the bike (each triathlon leg its own) and never above the sweat
      rate. Under an hour, drink to thirst.
    - What you'll drink = the target or what you can get, whichever is less:
      what you carry (the bike bottles in Settings; on the run, a handheld or
      vest from the Event page, never bottles) plus a 150 ml cup at each aid
      station with water or course drink (`AID_CUP_ML`, an assumption). Races
      say where you drink from on the Event page (per leg for triathlon);
      training uses what you carry. Aid-only with no stations asks for them.
    - Expected loss (sweat minus what you'll drink) in kg and as a % of body
      weight, with a warning over 3%; it sets "Rehydrate with" (1.25–1.5 L per
      kg, with some salt).
    - Sodium = what you'll drink × your sweat saltiness (PF&H), counting gels
      (from the Nutrition timeline) and course drinks, then your tab or mix in
      what you carry: whole or half tablets, at most 2 per bottle, never above
      the product's own strength, within its daily limit after the race-day
      pre-load (with the shortfall and a suggestion if the limit bites).
      "Optional for this length" under 2 h 30 below 25 °C. Aid stations only:
      tablets during are "Not in this plan".
    - Pre-loading: 750 mg sodium in 500 ml, twice (the evening before, and 90
      to 45 minutes before the start), using your product's servings (e.g. 2 ×
      Phizz at 334 mg). Recommended over 2 hours or 25 °C, or for salty
      sweaters; otherwise optional.
    - Swims: the fluid plan moves to before and after.
  - Triathlons show each leg's time window and its part in the plan: nothing on
    the swim, most carbs and fluid on the bike, gels and sips on the run
    (`legWindows()`, `LEG_ROLES`). Swims note that fuelling moves to before and after.
  - Also live: the event line, the saltiness band and the
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
    other), date and start time, and (training) whether you train again
    within 8 hours.
  - *Goal* (race): just finish, finish strong, go for a PB or race all out.
  - *Intensity* (training): easy, steady, tempo, race pace or intervals. The interval
    builder (warm-up, reps × work and rest, cool-down) works out the total time
    and a time-weighted overall intensity.
  - *Duration:* a time (one per leg for triathlon), or distance plus pace or
    speed, with the total worked out. Timer-style boxes as in Race Ready.
  - *Conditions:* indoor or outdoor (Pool or Open water for swimming), air
    temperature, humidity and elevation. Swimming uses water temperature and
    wetsuit instead of the air; triathlon has both. Blank boxes are "not set"
    and treated as mild (18 °C, 50%), never 0. `eventConditions()` gives the
    plan these, with an indoor flag (indoors raises the sweat estimate: little
    airflow).
  - *Drinking:* where you drink from on a race (what you carry, aid stations
    only, or both; per leg for triathlon), and what you carry on the run
    (nothing, a handheld or a vest, with its volume).
  - *Aid stations* (races only): the course drink and gel, picked from My
    products, and a fold-out card per station (leg, km, what it hands out).
    Cola counts as about 10 g carbs per 100 ml and food about 12 g a piece
    (`AID_ITEM_CARBS`).
  - *Start a new workout* (training) or *Clear this race* clears just that one,
    keeping the other, settings and products.
- **Units:** numbers are stored metric (kg, cm, ml, L/h) and converted for
  display, so switching units back and forth never changes a value.
- **PWA:** installs to the home screen, works offline, checks for an update on
  every resume and reloads to a new version only when the app isn't in use.

## Still to do

- **Distance and temperature units** are km and °C only for now.

Every app on `louistucker31.github.io` shares one localStorage and one set of
service-worker caches, so this app's keys and caches start with
`race-nutrition-` (`STORAGE_KEYS` in `js/main.js`, the key in `js/theme.js`
and `PREFIX` in `sw.js`). Never use `tri-`, which belongs to Race Ready.

After changing any file, bump `VERSION` in `sw.js` if you want installed copies
to drop their old cache straight away (they update on next launch either way).

## Data and privacy

Everything you enter (your details, sweat profile, gut training, products, bottles,
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
