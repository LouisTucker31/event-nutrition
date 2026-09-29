// Everything is saved to localStorage on this device. It can be unavailable
// (private browsing, storage full or blocked), in which case the app still works
// for the session and simply won't remember changes, so failures are ignored here.
const storage = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* see note above */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* see note above */ }
  }
};

// Every app on louistucker31.github.io shares one localStorage, so each app's
// keys start with its own prefix. The settings key is also read by js/theme.js.
const STORAGE_KEYS = { settings: "race-nutrition-settings-v1", view: "race-nutrition-view" };

// Settings
const settings = storage.read(STORAGE_KEYS.settings, {});
settings.theme = settings.theme || "light";
settings.fields = settings.fields || {};      // my details, sweat profile, gut training (metric numbers)
settings.products = settings.products || [];  // my products, in the order added
settings.units = { body: "metric", fluid: "metric", ...settings.units };
const saveSettings = () => storage.write(STORAGE_KEYS.settings, settings);

// Focus outlines on boxes are for keyboard users only: Tab turns them on,
// touching or clicking turns them off again
document.addEventListener("keydown", e => { if (e.key === "Tab") document.documentElement.classList.add("using-keyboard"); });
document.addEventListener("pointerdown", () => document.documentElement.classList.remove("using-keyboard"));

// Theme: light / dark / system (js/theme.js applies it early to avoid a flash).
// A theme picker is any set of buttons with data-theme-choice="light|dark|system",
// e.g. the triathlon app's Appearance control on its settings page.
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
// Browser bar colour for each theme; keep in step with --bg in css/styles.css
const THEME_COLORS = { light: "#ffffff", dark: "#0b0b0c" };
function applyTheme() {
  const dark = settings.theme === "dark" || (settings.theme === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeColorMeta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  document.querySelectorAll("[data-theme-choice]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === settings.theme)));
}
document.querySelectorAll("[data-theme-choice]").forEach(button => button.addEventListener("click", () => {
  settings.theme = button.dataset.themeChoice;
  saveSettings();
  applyTheme();
}));
darkQuery.addEventListener("change", applyTheme);
applyTheme();

// Views: one per nav tab, in the same order as the tabs in index.html
const VIEWS = ["nutrition", "hydration", "event"];
const APP_TITLE = "Race Nutrition";
const nav = document.querySelector(".lg-nav");
const tabs = [...nav.querySelectorAll(".lg-nav__item")];
// Browser tab title: the page heading plus the app name, e.g. "Page 2 – Race Nutrition"
const pageTitle = title => `${title} – ${APP_TITLE}`;

function showView(name) {
  VIEWS.forEach(view => { document.getElementById("view-" + view).hidden = view !== name; });
  const title = document.querySelector(`#view-${name} h1`);
  document.title = pageTitle(title.textContent);
  storage.write(STORAGE_KEYS.view, name);
  return title;
}

// Reopen on the page last used
let savedView = storage.read(STORAGE_KEYS.view, VIEWS[0]);
// Pages that were renamed
savedView = { page1: "nutrition", page2: "hydration", workout: "event" }[savedView] || savedView;
const startView = VIEWS.includes(savedView) ? savedView : VIEWS[0];
// Set the highlighted tab before the nav script reads it
tabs.forEach((tab, i) => {
  const active = VIEWS[i] === startView;
  tab.classList.toggle("is-active", active);
  if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
});
showView(startView);

nav.addEventListener("lg:change", e => {
  const title = showView(VIEWS[e.detail.index]);
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true }); // so screen readers announce the new view
});

// Settings pop-up: covers everything, including the nav. Its close button sits
// where the settings button was, so the cog appears to turn into a cross.
// Closing (button or Escape) leaves you on the page you were on, and the
// browser returns focus to the settings button.
const settingsDialog = document.getElementById("settingsDialog");
let titleBeforeSettings = document.title;
document.getElementById("openSettings").addEventListener("click", () => {
  titleBeforeSettings = document.title;
  settingsDialog.showModal();
  settingsDialog.scrollTop = 0;
  document.title = pageTitle("Settings");
});
const restoreTitle = () => { document.title = titleBeforeSettings; };
document.getElementById("closeSettings").addEventListener("click", () => {
  settingsDialog.close();
  restoreTitle();
});
// Escape fires "cancel" then "close"; either restores the title (it is harmless twice)
settingsDialog.addEventListener("cancel", restoreTitle);
settingsDialog.addEventListener("close", restoreTitle);

// Number boxes (data-format="number") format as you type: digits and one decimal
// point, with commas for thousands (1,500). data-decimals limits the decimal
// places (default 2; 0 allows whole numbers only); data-signed allows a leading
// minus (temperature); data-max caps the value (humidity).
function formatNumber(raw, decimals = 2, signed = false) {
  const minus = signed && raw.trim().startsWith("-") ? "-" : "";
  let digits = raw.replace(/[^\d.]/g, "");
  if (decimals === 0) digits = digits.replace(/\./g, "");
  const dot = digits.indexOf(".");
  if (dot !== -1) digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, "");
  let [whole, fraction] = digits.split(".");
  whole = whole.replace(/^0+(?=\d)/, "").slice(0, 7).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return minus + (fraction === undefined ? whole : `${whole || "0"}.${fraction.slice(0, decimals)}`);
}
const decimalsFor = input => Number(input.dataset.decimals ?? 2);
// A box's text as a number, or null when it's empty
function parseNumber(text) {
  const value = parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
// A stored number as box text, rounded to the box's decimal places (1.50 -> "1.5")
const displayNumber = (value, decimals) => formatNumber(String(Number(value.toFixed(decimals))), decimals, value < 0);

// Timer boxes work like a phone timer, as in Race Ready: digits fill in from the
// right. data-format="duration" reads h:mm:ss (1500 -> 0:15:00); "minsec" reads
// m:ss, for paces and interval lengths (530 -> 5:30). Stored as seconds.
function formatTimer(raw, type) {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, type === "duration" ? 6 : 4);
  if (!digits) return "";
  const padded = digits.padStart(type === "duration" ? 5 : 3, "0");
  return type === "duration"
    ? `${Number(padded.slice(0, -4))}:${padded.slice(-4, -2)}:${padded.slice(-2)}`
    : `${Number(padded.slice(0, -2))}:${padded.slice(-2)}`;
}
const pad2 = n => String(n).padStart(2, "0");
const toSeconds = text => String(text).split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
function formatHMS(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}
const formatMS = seconds => { const s = Math.round(seconds); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
const isTimer = input => ["duration", "minsec"].includes(input.dataset.format);

function formatAsYouType(input) {
  const type = input.dataset.format;
  input.addEventListener("input", () => {
    const before = input.value;
    if (isTimer(input)) {
      const after = formatTimer(before, type);
      if (after !== before) input.value = after;
      input.setSelectionRange(after.length, after.length); // always type at the end, like a timer
      return;
    }
    let after = formatNumber(before, decimalsFor(input), "signed" in input.dataset);
    if (input.dataset.max && parseNumber(after) > Number(input.dataset.max)) after = input.dataset.max;
    if (after === before) return;
    // Keep the caret after the same digit it was after
    const caret = input.selectionStart ?? before.length;
    const keptLeftOfCaret = before.slice(0, caret).replace(/[^\d.-]/g, "").length;
    input.value = after;
    let pos = 0, seen = 0;
    while (pos < after.length && seen < keptLeftOfCaret) { if (/[\d.-]/.test(after[pos])) seen++; pos++; }
    input.setSelectionRange(pos, pos);
  }, { capture: true }); // before the save handlers, so the formatted value is what's saved
  // Tidy timer overflow when leaving the box: 0:75 -> 1:15
  if (isTimer(input)) input.addEventListener("blur", () => {
    if (!input.value) return;
    const tidy = type === "duration" ? formatHMS(toSeconds(input.value)) : formatMS(toSeconds(input.value));
    if (tidy === input.value) return;
    input.value = tidy;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
document.querySelectorAll("#settingsDialog [data-format], #view-event [data-format]").forEach(formatAsYouType);

// Units. Everything is stored metric (kg, cm, ml, L/h) and converted for display,
// so switching units never loses precision. data-convert on a box names its
// conversion; "body" units cover weight and height, "fluid" units cover volumes
// and sweat rate. fl oz are US fluid ounces (29.57 ml), as on most product labels.
const ML_PER_FL_OZ = 29.5735;
const UNIT_CONVERSIONS = {
  weight: { units: "body", metric: { label: "kg", factor: 1, decimals: 1 }, imperial: { label: "lb", factor: 2.20462, decimals: 1 } },
  volume: { units: "fluid", metric: { label: "ml", factor: 1, decimals: 0 }, imperial: { label: "fl oz", factor: 1 / ML_PER_FL_OZ, decimals: 1 } },
  rate: { units: "fluid", metric: { label: "L/h", factor: 1, decimals: 2 }, imperial: { label: "fl oz/h", factor: 1000 / ML_PER_FL_OZ, decimals: 1 } }
};
const unitFor = kind => UNIT_CONVERSIONS[kind][settings.units[UNIT_CONVERSIONS[kind].units]];
const toDisplay = (kind, value) => value * unitFor(kind).factor;
const fromDisplay = (kind, value) => value / unitFor(kind).factor;
const formatWithUnit = (kind, value) => `${displayNumber(toDisplay(kind, value), unitFor(kind).decimals)} ${unitFor(kind).label}`;

// Show a stored value in its box, in the current units (timers from seconds)
function fillNumberBox(input, value) {
  if (isTimer(input)) {
    input.value = value == null ? "" : input.dataset.format === "duration" ? formatHMS(value) : formatMS(value);
    return;
  }
  const kind = input.dataset.convert;
  if (kind) input.dataset.decimals = unitFor(kind).decimals;
  input.value = value == null ? "" : displayNumber(kind ? toDisplay(kind, value) : value, decimalsFor(input));
}
// A box's value to store: a metric number (or seconds), or undefined when empty
function readNumberBox(input) {
  if (isTimer(input)) return input.value ? toSeconds(input.value) : undefined;
  const value = parseNumber(input.value);
  if (value === null) return undefined;
  return input.dataset.convert ? fromDisplay(input.dataset.convert, value) : value;
}
const setOrDelete = (object, key, value) => { if (value === undefined || value === "") delete object[key]; else object[key] = value; };

// Settings fields (data-key): selects save their value, number boxes a metric number
const fields = settings.fields;
const fieldInputs = [...document.querySelectorAll("#settingsDialog [data-key]")];
fieldInputs.forEach(input => input.addEventListener("input", () => {
  setOrDelete(fields, input.dataset.key, input.dataset.format ? readNumberBox(input) : input.value);
  saveSettings();
  updateSweatTest();
  updateSaltBand();
  updateRateConditions();
}));

// Sweat rate. "Less / average / more" each have a base rate (L/h) for the
// reference conditions, about 18 °C at a steady effort. A measured rate keeps
// the conditions it was measured in (temperature, sport, effort). Either way,
// sweatBaseline() gives the plan a rate plus its conditions, for it to scale to
// the event's temperature, intensity and sport.
const SWEAT_LEVELS = { less: 0.5, average: 0.9, more: 1.3 };
const SWEAT_REFERENCE = { temperature: 18, effort: "steady" };
function sweatBaseline() {
  if (fields.sweatRate != null) {
    return { rate: fields.sweatRate, measured: true,
      temperature: fields.sweatRateTemp ?? SWEAT_REFERENCE.temperature,
      effort: fields.sweatRateEffort || SWEAT_REFERENCE.effort,
      sport: fields.sweatRateSport || null };
  }
  if (!SWEAT_LEVELS[fields.sweatLevel]) return null;
  return { rate: SWEAT_LEVELS[fields.sweatLevel], measured: false, ...SWEAT_REFERENCE, sport: null };
}
// Show each level's base rate in the list, in the chosen units
const sweatLevelOptions = [...document.querySelectorAll('[data-key="sweatLevel"] option')].filter(option => option.value);
sweatLevelOptions.forEach(option => { option.dataset.label = option.textContent; });
function labelSweatLevels() {
  sweatLevelOptions.forEach(option => {
    option.textContent = `${option.dataset.label} (${formatWithUnit("rate", SWEAT_LEVELS[option.value])})`;
  });
}
// The measured rate's conditions show once there's a measured rate
const rateConditions = document.getElementById("rateConditions");
function updateRateConditions() {
  rateConditions.hidden = fields.sweatRate == null;
  // No divider under the rate box when it's the last thing in the group
  rateConditions.previousElementSibling.classList.toggle("is-last-visible", rateConditions.hidden);
}

// Height: one box in cm, or feet and inches
const heightInputs = { cm: document.getElementById("heightCm"), ft: document.getElementById("heightFt"), in: document.getElementById("heightIn") };
const CM_PER_INCH = 2.54;
function fillHeight() {
  const imperial = settings.units.body === "imperial";
  document.querySelectorAll("#heightField [data-units]").forEach(box => { box.hidden = box.dataset.units !== settings.units.body; });
  Object.values(heightInputs).forEach(input => { input.value = ""; });
  if (fields.height == null) return;
  if (!imperial) { heightInputs.cm.value = String(Math.round(fields.height)); return; }
  const inches = Math.round(fields.height / CM_PER_INCH);
  heightInputs.ft.value = String(Math.floor(inches / 12));
  heightInputs.in.value = String(inches % 12);
}
heightInputs.cm.addEventListener("input", () => {
  setOrDelete(fields, "height", parseNumber(heightInputs.cm.value) ?? undefined);
  saveSettings();
});
[heightInputs.ft, heightInputs.in].forEach(input => input.addEventListener("input", () => {
  const ft = parseNumber(heightInputs.ft.value), inches = parseNumber(heightInputs.in.value);
  setOrDelete(fields, "height", ft === null && inches === null ? undefined : ((ft ?? 0) * 12 + (inches ?? 0)) * CM_PER_INCH);
  saveSettings();
}));

// Sweat test: sweat rate = (weight before - weight after + fluid drunk) / hours,
// taking 1 kg of weight lost as 1 litre of sweat
const sweatTest = document.getElementById("sweatTest");
const sweatTestToggle = sweatTest.querySelector(".disclosure__toggle");
sweatTestToggle.addEventListener("click", () => {
  const open = sweatTest.classList.toggle("is-open");
  sweatTestToggle.setAttribute("aria-expanded", String(open));
});
const testResult = document.getElementById("testResult");
const useTestResult = document.getElementById("useTestResult");
let testRate = null; // L/h, once the test boxes give a sensible answer
function updateSweatTest() {
  const { testBefore, testAfter, testDrank = 0, testMinutes } = fields;
  testRate = null;
  if (testBefore != null && testAfter != null && testMinutes > 0) {
    const rate = (testBefore - testAfter + testDrank / 1000) / (testMinutes / 60);
    if (rate > 0 && rate < 5) testRate = rate; // outside this, a number is probably mistyped
  }
  const filledIn = testBefore != null || testAfter != null;
  testResult.textContent = testRate !== null ? formatWithUnit("rate", testRate) : filledIn ? "Check the numbers above" : "–";
  testResult.classList.toggle("is-set", testRate !== null);
  useTestResult.disabled = testRate === null;
}
// Using the result also copies the test's conditions to the measured rate
useTestResult.addEventListener("click", () => {
  fields.sweatRate = testRate;
  setOrDelete(fields, "sweatRateTemp", fields.testTemp);
  setOrDelete(fields, "sweatRateSport", fields.testSport);
  setOrDelete(fields, "sweatRateEffort", fields.testEffort);
  saveSettings();
  ["sweatRate", "sweatRateTemp", "sweatRateSport", "sweatRateEffort"].forEach(key => {
    const input = document.querySelector(`[data-key="${key}"]`);
    if (input.dataset.format) fillNumberBox(input, fields[key]); else input.value = fields[key] ?? "";
  });
  updateRateConditions();
});

// Saltiness band: from a lab result if there is one, otherwise from how many of
// the six salty-sweater signs are ticked (0-1 low, 2-3 average, 4-6 high).
// Sweat sodium is in mg per litre. "below" sorts a lab result into a band;
// "working" is the one value the hydration maths uses for a band (950 is
// Precision Fuel & Hydration's published average).
const SALT_BANDS = [
  { name: "Low", below: 700, working: 500, minSigns: 0 },
  { name: "Average", below: 1200, working: 950, minSigns: 2 },
  { name: "High", below: Infinity, working: 1500, minSigns: 4 }
];
const saltSignInputs = [...document.querySelectorAll("[data-salty-sign]")];
const saltBand = document.getElementById("saltBand");
// The band, from the lab result or the ticks, and whether either has been given
function currentSaltBand() {
  const signs = fields.saltySigns || [];
  const band = fields.sweatSodium != null
    ? SALT_BANDS.find(b => fields.sweatSodium < b.below)
    : SALT_BANDS.findLast(b => signs.length >= b.minSigns);
  return { band, isSet: fields.sweatSodium != null || signs.length > 0 };
}
// Sweat sodium for the hydration maths (mg/L): the lab result, or the band's working value
const sweatSodiumMgPerL = () => fields.sweatSodium ?? currentSaltBand().band.working;
// Carbs per hour cap from gut training (g/h), or null when it's empty: the plan
// then follows the standard guidance with no cap
const gutCarbCap = () => (fields.gutCarbs > 0 ? fields.gutCarbs : null);
function updateSaltBand() {
  const { band, isSet } = currentSaltBand();
  saltBand.textContent = fields.sweatSodium != null
    ? `${band.name} (${displayNumber(fields.sweatSodium, 0)} mg/L, from your lab test)`
    : `${band.name} (about ${displayNumber(band.working, 0)} mg/L)`;
  saltBand.classList.toggle("is-set", isSet);
}
saltSignInputs.forEach(input => input.addEventListener("change", () => {
  setOrDelete(fields, "saltySigns", saltSignInputs.filter(box => box.checked).map(box => Number(box.dataset.saltySign)));
  if (fields.saltySigns?.length === 0) delete fields.saltySigns;
  saveSettings();
  updateSaltBand();
}));

// My products: one card each, from the template in index.html. Carbs (g) and
// sodium (mg) are per serving; drink mixes and tabs also store the water one
// serving is mixed with (ml).
const productList = document.getElementById("productList");
const productTemplate = document.getElementById("productTemplate");
const productsEmpty = document.getElementById("productsEmpty");
const productTitle = product => product.name?.trim() || "New product";
const PRODUCT_TYPES = { gel: "Gel", drink: "Drink mix", tab: "Electrolyte tab", chew: "Chews", bar: "Bar", other: "Other" };
// The folded card's second line, e.g. "Gel · 30 g carbs · 200 mg sodium"
function productSummary(product) {
  const parts = [PRODUCT_TYPES[product.type]];
  if (product.carbs != null) parts.push(`${displayNumber(product.carbs, 1)} g carbs`);
  if (product.sodium != null) parts.push(`${displayNumber(product.sodium, 0)} mg sodium`);
  if (product.caffeine > 0) parts.push(`${displayNumber(product.caffeine, 0)} mg caffeine`);
  if (product.carbType) parts.push(product.carbType === "dual" ? "glucose + fructose" : "glucose only");
  if (product.volume != null && ["drink", "tab"].includes(product.type)) parts.push(`in ${formatWithUnit("volume", product.volume)}`);
  return parts.join(" · ");
}
// Fold-out cards (products, aid stations) in a list: they start folded and one
// is open at a time, as in Race Ready's checklists. onToggle(open) lets the
// caller remember which is open across re-renders.
function makeFoldCard(card, list, id, open, onToggle) {
  const toggle = card.querySelector(".disclosure__toggle");
  const body = card.querySelector(".disclosure__body");
  body.id = id;
  toggle.setAttribute("aria-controls", id);
  const setOpen = (el, isOpen) => {
    el.classList.toggle("is-open", isOpen);
    el.querySelector(".disclosure__toggle").setAttribute("aria-expanded", String(isOpen));
  };
  setOpen(card, open);
  toggle.addEventListener("click", () => {
    const opening = !card.classList.contains("is-open");
    list.querySelectorAll(".disclosure.is-open").forEach(other => setOpen(other, false));
    setOpen(card, opening);
    onToggle(opening);
  });
}

// A new product opens so it can be filled in
let openProductId = null;
let productToRemove = null;

function renderProducts() {
  productList.textContent = "";
  productsEmpty.hidden = settings.products.length > 0;
  document.getElementById("removeAllProducts").hidden = settings.products.length === 0;
  settings.products.forEach(product => {
    const card = productTemplate.content.firstElementChild.cloneNode(true);
    makeFoldCard(card, productList, `product-${product.id}`, product.id === openProductId,
      open => { openProductId = open ? product.id : null; });

    const title = card.querySelector(".product__title");
    const summary = card.querySelector(".product__summary");
    const removeButton = card.querySelector(".product__remove");
    const showHeader = () => {
      title.textContent = productTitle(product);
      summary.textContent = productSummary(product);
      removeButton.setAttribute("aria-label", `Remove ${productTitle(product)}`);
    };
    showHeader();
    const showTypeFields = () => card.querySelectorAll("[data-product-types]").forEach(field => {
      field.hidden = !field.dataset.productTypes.split(" ").includes(product.type);
    });
    card.querySelectorAll("[data-product-key]").forEach(input => {
      const key = input.dataset.productKey;
      if (input.dataset.format) { formatAsYouType(input); fillNumberBox(input, product[key]); }
      else input.value = product[key] ?? "";
      input.addEventListener("input", () => {
        setOrDelete(product, key, input.dataset.format ? readNumberBox(input) : input.value);
        saveSettings();
        showHeader();
        if (key === "type") showTypeFields();
      });
    });
    showTypeFields();
    card.querySelectorAll("[data-unit-label]").forEach(label => { label.textContent = unitFor(label.dataset.unitLabel).label; });
    removeButton.addEventListener("click", () => {
      const hasDetails = Object.keys(product).some(key => !["id", "type"].includes(key));
      if (!hasDetails) return removeProduct(product);
      confirmRemoveProducts(product, `Remove ${productTitle(product)}?`, "You can't undo this.");
    });
    productList.append(card);
  });
}
function removeProduct(product) {
  settings.products = settings.products.filter(p => p !== product);
  if (openProductId === product.id) openProductId = null;
  saveSettings();
  renderProducts();
  document.getElementById("addProduct").focus();
}
document.getElementById("addProduct").addEventListener("click", () => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  settings.products.push({ id, type: "gel" });
  openProductId = id;
  saveSettings();
  renderProducts();
  const nameInput = productList.lastElementChild.querySelector('[data-product-key="name"]');
  nameInput.focus();
  nameInput.scrollIntoView({ block: "center", behavior: "smooth" });
});
// One confirmation for removing a product or all of them ("all")
const removeProductDialog = document.getElementById("removeProductDialog");
function confirmRemoveProducts(target, title, description) {
  productToRemove = target;
  document.getElementById("removeProductTitle").textContent = title;
  document.getElementById("removeProductDesc").textContent = description;
  removeProductDialog.showModal();
}
document.getElementById("removeProductCancel").addEventListener("click", () => removeProductDialog.close());
removeProductDialog.addEventListener("click", e => { if (e.target === removeProductDialog) removeProductDialog.close(); }); // tap outside
document.getElementById("removeProductConfirm").addEventListener("click", () => {
  removeProductDialog.close();
  if (productToRemove === "all") {
    settings.products = [];
    openProductId = null;
    saveSettings();
    renderProducts();
    document.getElementById("addProduct").focus();
  } else if (productToRemove) removeProduct(productToRemove);
  productToRemove = null;
});
// Products are kept by Clear my details, so they have their own clear
const removeAllProducts = document.getElementById("removeAllProducts");
removeAllProducts.addEventListener("click", () => {
  const count = settings.products.length;
  confirmRemoveProducts("all", "Remove all products?",
    `This removes all ${count} product${count === 1 ? "" : "s"}. You can't undo this.`);
});

// Fill every box from storage, in the current units (on load, after a units
// change and after clearing)
function renderSettings() {
  labelSweatLevels();
  fieldInputs.forEach(input => {
    if (input.dataset.format) fillNumberBox(input, fields[input.dataset.key]);
    else input.value = fields[input.dataset.key] ?? input.dataset.default ?? ""; // e.g. meal hours default to 2
  });
  fillHeight();
  updateRateConditions();
  saltSignInputs.forEach(box => { box.checked = (fields.saltySigns || []).includes(Number(box.dataset.saltySign)); });
  document.querySelectorAll("[data-unit-choice]").forEach(button =>
    button.setAttribute("aria-pressed", String(settings.units[button.dataset.unitChoice] === button.dataset.value)));
  document.querySelectorAll("[data-unit-label]").forEach(label => { label.textContent = unitFor(label.dataset.unitLabel).label; });
  renderProducts(); // product cards fill in their own unit labels
  updateSweatTest();
  updateSaltBand();
}
document.querySelectorAll("[data-unit-choice]").forEach(button => button.addEventListener("click", () => {
  settings.units[button.dataset.unitChoice] = button.dataset.value;
  saveSettings();
  renderSettings();
  renderWorkout(); // the run carry volume is in ml or fl oz (this also refreshes the plan pages)
}));
renderSettings();

// Clear my details: your details, sweat profile and gut training (not products, bottles, units or theme)
const resetDialog = document.getElementById("resetDialog");
document.getElementById("resetApp").addEventListener("click", () => resetDialog.showModal());
document.getElementById("resetCancel").addEventListener("click", () => resetDialog.close());
resetDialog.addEventListener("click", e => { if (e.target === resetDialog) resetDialog.close(); }); // tap outside
// Products and bottles are kit you keep between races, so they stay
const KIT_KEYS = ["bottleSize", "bottleCount"];
document.getElementById("resetConfirm").addEventListener("click", () => {
  Object.keys(fields).filter(key => !KIT_KEYS.includes(key)).forEach(key => delete fields[key]);
  saveSettings();
  renderSettings();
  resetDialog.close();
});

// Event page: two separate workouts, one for training and one for the race,
// in settings.workouts.training and .race; settings.workoutMode says which is
// showing. The race stays as it is while the training one is edited for each
// session. Each is saved as strings for choices, dates and times; numbers for
// distances (swim m, bike and run km), speeds (km/h), temperature (°C),
// humidity (%) and elevation (m); seconds for durations, paces
// and intervals.
const WORKOUT_DEFAULTS = { type: "run", setBy: "time", intensity: "steady", workIntensity: "tempo", environment: "outdoor" };
const WORKOUT_MODES = ["training", "race"];
// Races have a goal (just finish ... race all out) in place of an intensity
const RACE_GOALS = ["finish", "strong", "pb", "allout"];
const blankWorkout = mode => ({ ...WORKOUT_DEFAULTS, ...(mode === "race" && { goal: "strong" }), aidStations: [] });
// Earlier versions kept one workout, marked training or race: it moves to its slot
if (settings.workout) {
  const { event, ...saved } = settings.workout;
  settings.workoutMode = event === "race" ? "race" : "training";
  settings.workouts = { [settings.workoutMode]: saved };
  delete settings.workout;
}
settings.workouts = settings.workouts || {};
WORKOUT_MODES.forEach(mode => {
  const w = settings.workouts[mode] = { ...blankWorkout(mode), ...settings.workouts[mode] };
  // Strength, HYROX and BJJ / MMA were removed as types: those workouts become Other
  if (["strength", "hyrox", "combat"].includes(w.type)) w.type = "other";
  // The sweat test moved off this page (it's in Settings)
  ["testBefore", "testAfter", "testDrank"].forEach(key => delete w[key]);
});
if (!RACE_GOALS.includes(settings.workouts.race.goal)) settings.workouts.race.goal = "strong";
if (!WORKOUT_MODES.includes(settings.workoutMode)) settings.workoutMode = "training";
saveSettings();
const workout = () => settings.workouts[settings.workoutMode];
const workoutView = document.getElementById("view-event");
const workoutInputs = [...workoutView.querySelectorAll("[data-workout-key]")];
const DISTANCE_TYPES = ["run", "bike", "swim", "triathlon"];
// Time or distance only applies to sports with a distance; the rest use time
const effectiveSetBy = () => DISTANCE_TYPES.includes(workout().type) ? workout().setBy : "time";
// Intervals are for training; a race is paced by its goal
const usesIntervals = w => settings.workoutMode === "training" && w.intensity === "intervals";

workoutInputs.forEach(input => input.addEventListener("input", () => {
  const key = input.dataset.workoutKey;
  setOrDelete(workout(), key, input.dataset.format ? readNumberBox(input) : input.value);
  saveSettings();
  refreshWorkout();
}));
document.querySelectorAll("[data-workout-choice]").forEach(button => button.addEventListener("click", () => {
  workout()[button.dataset.workoutChoice] = button.dataset.value;
  saveSettings();
  refreshWorkout();
}));
// Training / Race: switch which workout the page shows and edits
document.querySelectorAll("[data-workout-mode]").forEach(button => button.addEventListener("click", () => {
  if (settings.workoutMode === button.dataset.workoutMode) return;
  settings.workoutMode = button.dataset.workoutMode;
  openAidId = null;
  saveSettings();
  renderWorkout();
  importNote.textContent = IMPORT_NOTE;
}));

// Dates read "03 Apr 27", as in Race Ready: the text is laid over the phone's
// date box, which can't be reformatted itself
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatShortDate(value) {
  const [year, month, day] = (value || "").split("-");
  return year ? `${day} ${MONTHS[Number(month) - 1]} ${year.slice(-2)}` : "";
}
function updateDateDisplays() {
  document.querySelectorAll(".date-field").forEach(wrapper => {
    const text = formatShortDate(wrapper.querySelector("input").value);
    wrapper.querySelector(".date-field__text").textContent = text;
    wrapper.classList.toggle("has-value", !!text);
  });
}
document.querySelectorAll(".date-field input").forEach(input => input.addEventListener("input", updateDateDisplays));

// Show only what applies (see the data- attributes described in index.html);
// rows with nothing left in them are hidden too
const conditionOf = el => ["types", "setBy", "event", "env", "intervals", "carry"].some(key => key in el.dataset);
function applyWorkoutVisibility() {
  const w = workout();
  const checks = {
    types: value => value.split(" ").includes(w.type),
    setBy: value => value === effectiveSetBy(),
    event: value => value === settings.workoutMode,
    env: value => value === w.environment,
    intervals: value => value === (usesIntervals(w) ? "yes" : "no"),
    carry: value => value === (w.runCarry && w.runCarry !== "none" ? "yes" : "no")
  };
  workoutView.querySelectorAll("[data-types], [data-set-by], [data-event], [data-env], [data-intervals], [data-carry]").forEach(el => {
    el.hidden = !Object.entries(checks).every(([key, passes]) => !(key in el.dataset) || passes(el.dataset[key]));
  });
  workoutView.querySelectorAll(".field-row").forEach(row => {
    const ownHidden = conditionOf(row) && row.hidden;
    row.hidden = ownHidden || [...row.children].every(child => child.hidden);
  });
  // The total is only worth showing when it's worked out, not typed in
  document.getElementById("totalTimeField").hidden =
    effectiveSetBy() === "time" && w.type !== "triathlon" && !usesIntervals(w);
  workoutView.querySelectorAll(".field-group").forEach(group => {
    const visible = [...group.children].filter(child => !child.hidden);
    [...group.children].forEach(child => child.classList.toggle("is-last-visible", child === visible[visible.length - 1]));
  });
  workoutView.querySelectorAll("[data-workout-choice]").forEach(button =>
    button.setAttribute("aria-pressed", String(w[button.dataset.workoutChoice] === button.dataset.value)));
  // Indoor / Outdoor reads Pool / Open water for swimming
  workoutView.querySelectorAll("[data-swim-label]").forEach(button => {
    button.dataset.label ??= button.textContent;
    button.textContent = w.type === "swim" ? button.dataset.swimLabel : button.dataset.label;
  });
  const text = MODE_TEXT[settings.workoutMode];
  document.querySelectorAll("[data-workout-mode]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.workoutMode === settings.workoutMode)));
  document.getElementById("workoutModeNote").textContent = text.note;
  document.getElementById("workoutName").placeholder = text.placeholder;
  document.getElementById("newWorkout").textContent = text.reset;
  document.getElementById("newWorkoutNote").textContent = text.resetNote;
  document.getElementById("newWorkoutTitle").textContent = `${text.reset}?`;
  document.getElementById("newWorkoutDesc").textContent = text.resetConfirm;
}
// Wording that changes with Training / Race
const MODE_TEXT = {
  training: {
    note: "Change this for each session. Your race is kept separately.",
    placeholder: "e.g. Sunday long run",
    reset: "Start a new workout",
    resetNote: "Clears this training workout. Your race, settings and products are kept.",
    resetConfirm: "This clears the training workout. Your race, settings and products stay. You can't undo this."
  },
  race: {
    note: "Your race stays here while you change the training workout.",
    placeholder: "e.g. Weymouth Triathlon",
    reset: "Clear this race",
    resetNote: "Clears the race. Your training workout, settings and products are kept.",
    resetConfirm: "This clears the race. Your training workout, settings and products stay. You can't undo this."
  }
};

// Intervals: total time and a time-weighted overall intensity. Warm-up,
// cool-down and rest count as easy; rest comes between reps, not after the last.
const INTENSITY_LEVELS = { easy: 1, steady: 2, tempo: 3, race: 4, hard: 5 };
const INTENSITY_NAMES = ["Easy", "Steady", "Tempo", "Race pace"];
function intervalPlan(w) {
  if (!(w.reps > 0 && w.work > 0)) return null;
  const easy = (w.warmup || 0) + (w.cooldown || 0) + (w.reps - 1) * (w.rest || 0);
  const hard = w.reps * w.work;
  const total = easy + hard;
  const level = (easy * INTENSITY_LEVELS.easy + hard * INTENSITY_LEVELS[w.workIntensity]) / total;
  return { total, name: INTENSITY_NAMES[Math.min(3, Math.round(level) - 1)] };
}

// Time for each leg, from times typed in, or from distance and pace or speed.
// Legs that can't be worked out yet are left out.
function workoutLegs(w) {
  if (usesIntervals(w)) {
    const plan = intervalPlan(w);
    return plan ? [["Total", plan.total]] : [];
  }
  const tri = w.type === "triathlon";
  const legs = [];
  const add = (name, seconds) => { if (seconds > 0) legs.push([name, seconds]); };
  if (effectiveSetBy() === "time") {
    if (!tri) add("Total", w.duration);
    else { add("Swim", w.swimTime); add("T1", w.t1Time); add("Bike", w.bikeTime); add("T2", w.t2Time); add("Run", w.runTime); }
    return legs;
  }
  const has = leg => tri || w.type === leg;
  if (has("swim")) add("Swim", w.swimDistance / 100 * w.swimPace);
  if (tri) add("T1", w.t1Time);
  if (has("bike")) add("Bike", w.bikeDistance / w.bikeSpeed * 3600);
  if (tri) add("T2", w.t2Time);
  if (has("run")) add("Run", w.runDistance * w.runPace);
  return legs;
}
const workoutSeconds = () => workoutLegs(workout()).reduce((total, [, seconds]) => total + seconds, 0);

// Triathlon legs with their time windows from the start, for the plan: e.g.
// { leg: "bike", name: "Bike", start: 2000, end: 7400 }. Transitions count in
// the timing but have no part of their own in the plan.
function legWindows(w = workout()) {
  if (w.type !== "triathlon" || usesIntervals(w)) return [];
  let clock = 0;
  return workoutLegs(w).map(([name, seconds]) => {
    const window = { leg: name.toLowerCase(), name, start: clock, end: clock + seconds };
    clock += seconds;
    return window;
  }).filter(window => !["t1", "t2"].includes(window.leg));
}
// What each triathlon leg is for: nothing on the swim, most carbs and fluid on
// the bike (it's easier to eat there), gels and sips on the run
const LEG_ROLES = {
  swim: { nutrition: "Nothing: you can't eat while swimming", hydration: "Nothing: you can't drink while swimming" },
  bike: { nutrition: "Most of your carbs: it's easier to eat on the bike", hydration: "Most of your fluid and sodium" },
  run: { nutrition: "Gels", hydration: "Sips at aid stations" }
};

// The conditions for the plan. Blank boxes are "not set" and treated as mild,
// never as 0 °C or 0%. Indoors (a turbo or treadmill) raises the sweat
// estimate: there's little airflow to cool you. Swimming uses the water
// temperature and wetsuit instead of the air.
const MILD_CONDITIONS = { temperature: 18, humidity: 50 };
function eventConditions(w = workout()) {
  const inWater = ["swim", "triathlon"].includes(w.type);
  const outdoor = w.environment !== "indoor";
  return {
    indoor: !outdoor,
    air: w.type === "swim" ? null : {
      temperature: w.temperature ?? MILD_CONDITIONS.temperature,
      humidity: w.humidity ?? MILD_CONDITIONS.humidity,
      isSet: w.temperature != null
    },
    water: inWater ? { temperature: w.waterTemperature ?? null, wetsuit: outdoor && w.wetsuit === "yes" } : null
  };
}

const totalTime = document.getElementById("totalTime");
const totalTimeDetail = document.getElementById("totalTimeDetail");
function updateWorkoutMaths() {
  const w = workout();
  const plan = intervalPlan(w);
  const overall = document.getElementById("overallIntensity");
  const intervalTotal = document.getElementById("intervalTotal");
  overall.textContent = plan ? plan.name : "–";
  intervalTotal.textContent = plan ? formatHMS(plan.total) : "–";
  overall.classList.toggle("is-set", !!plan);
  intervalTotal.classList.toggle("is-set", !!plan);

  const legs = workoutLegs(w);
  const total = workoutSeconds();
  totalTime.textContent = total ? formatHMS(total) : "–";
  totalTime.classList.toggle("is-set", total > 0);
  totalTimeDetail.textContent = legs.length > 1 ? legs.map(([name, seconds]) => `${name} ${formatHMS(seconds)}`).join(" · ") : "";
}

// Course products: picked from My products (drinks and tabs, or gels and chews)
function fillCourseSelects() {
  workoutView.querySelectorAll("[data-course-types]").forEach(select => {
    const types = select.dataset.courseTypes.split(" ");
    select.textContent = "";
    select.append(new Option("Not known", ""));
    settings.products.filter(product => types.includes(product.type))
      .forEach(product => select.append(new Option(productTitle(product), product.id)));
    const saved = workout()[select.dataset.workoutKey];
    select.value = settings.products.some(product => product.id === saved) ? saved : "";
  });
}
settingsDialog.addEventListener("close", fillCourseSelects); // products may have changed

// Aid stations: one fold-out card each, in the order added. Triathlons say which
// leg each is on (bike or run).
const aidList = document.getElementById("aidList");
const aidTemplate = document.getElementById("aidTemplate");
const AID_ITEMS = { water: "Water", drink: "Course drink", gel: "Course gel", cola: "Cola", food: "Food" };
// Rough carbs for what the course hands out that isn't one of your products
// (the course drink and gel come from My products)
const AID_ITEM_CARBS = { cola: { gramsPer100ml: 10 }, food: { gramsEach: 12 } }; // food: e.g. half a banana
let openAidId = null;
function aidSummary(station) {
  const parts = [];
  if (workout().type === "triathlon") parts.push(station.leg === "run" ? "Run" : "Bike");
  if (station.at != null) parts.push(`${displayNumber(station.at, 1)} km`);
  const items = (station.items || []).map(item => AID_ITEMS[item]);
  if (items.length) parts.push(items.join(", "));
  return parts.join(" · ");
}
function renderAid() {
  const stations = workout().aidStations;
  aidList.textContent = "";
  document.getElementById("aidEmpty").hidden = stations.length > 0;
  stations.forEach((station, index) => {
    const card = aidTemplate.content.firstElementChild.cloneNode(true);
    makeFoldCard(card, aidList, `aid-${station.id}`, station.id === openAidId,
      open => { openAidId = open ? station.id : null; });
    card.querySelector(".aid__title").textContent = `Aid station ${index + 1}`;
    const summary = card.querySelector(".aid__summary");
    const showSummary = () => { summary.textContent = aidSummary(station); };
    showSummary();
    card.querySelector("[data-aid-leg]").hidden = workout().type !== "triathlon";
    card.querySelectorAll("[data-aid-key]").forEach(input => {
      const key = input.dataset.aidKey;
      if (input.dataset.format) { formatAsYouType(input); fillNumberBox(input, station[key]); }
      else input.value = station[key] ?? "bike";
      input.addEventListener("input", () => {
        setOrDelete(station, key, input.dataset.format ? readNumberBox(input) : input.value);
        saveSettings();
        showSummary();
      });
    });
    card.querySelectorAll("[data-aid-item]").forEach(box => {
      box.checked = (station.items || []).includes(box.dataset.aidItem);
      box.addEventListener("change", () => {
        station.items = [...card.querySelectorAll("[data-aid-item]:checked")].map(b => b.dataset.aidItem);
        saveSettings();
        showSummary();
      });
    });
    const remove = card.querySelector(".aid__remove");
    remove.setAttribute("aria-label", `Remove aid station ${index + 1}`);
    remove.addEventListener("click", () => {
      workout().aidStations = stations.filter(s => s !== station);
      saveSettings();
      renderAid();
      document.getElementById("addAid").focus();
    });
    aidList.append(card);
  });
}
document.getElementById("addAid").addEventListener("click", () => {
  const stations = workout().aidStations;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Start on the same leg as the last one
  stations.push({ id, leg: stations[stations.length - 1]?.leg || "bike", items: ["water"] });
  openAidId = id;
  saveSettings();
  renderAid();
  const at = aidList.lastElementChild.querySelector('[data-aid-key="at"]');
  at.focus();
  at.scrollIntoView({ block: "center", behavior: "smooth" });
});

// Refresh what depends on the choices (after any change)
let aidRenderedFor = null;
function refreshWorkout() {
  applyWorkoutVisibility();
  updateWorkoutMaths();
  // Aid station cards show the leg for triathlons only
  if (aidRenderedFor !== workout().type) { aidRenderedFor = workout().type; renderAid(); }
  renderPlans();
}
// Fill every box from storage (on load, after units change, clearing or importing)
function renderWorkout() {
  workoutInputs.filter(input => !input.dataset.courseTypes).forEach(input => {
    const value = workout()[input.dataset.workoutKey];
    if (input.dataset.format) fillNumberBox(input, value);
    else input.value = value ?? "";
  });
  workoutView.querySelectorAll("[data-unit-label]").forEach(label => { label.textContent = unitFor(label.dataset.unitLabel).label; });
  fillCourseSelects();
  updateDateDisplays();
  renderAid();
  aidRenderedFor = workout().type;
  refreshWorkout();
}

// Start a new workout / Clear this race: clears the one showing, keeping the
// other, settings and products
const newWorkoutDialog = document.getElementById("newWorkoutDialog");
document.getElementById("newWorkout").addEventListener("click", () => newWorkoutDialog.showModal());
document.getElementById("newWorkoutCancel").addEventListener("click", () => newWorkoutDialog.close());
newWorkoutDialog.addEventListener("click", e => { if (e.target === newWorkoutDialog) newWorkoutDialog.close(); }); // tap outside
document.getElementById("newWorkoutConfirm").addEventListener("click", () => {
  settings.workouts[settings.workoutMode] = blankWorkout(settings.workoutMode);
  openAidId = null;
  saveSettings();
  renderWorkout();
  newWorkoutDialog.close();
});

// Import from Race Ready. Both apps are on louistucker31.github.io, so they share
// one localStorage: Race Ready keeps its current event in "tri-settings-v1" as
// events[eventType], with distances as text ("1,500") and goal times as h:mm:ss.
// This only ever reads Race Ready's data.
const RACE_READY_KEY = "tri-settings-v1";
const RACE_READY_TYPES = { triathlon: "triathlon", running: "run", cycling: "bike", swimming: "swim" };
function raceReadyEvent() {
  const saved = storage.read(RACE_READY_KEY, null);
  const type = saved?.eventType || "triathlon";
  const event = saved?.events?.[type];
  if (!event || !RACE_READY_TYPES[type]) return null;
  const hasDetails = ["raceName", "raceDate", "swimDistance", "bikeDistance", "runDistance"].some(key => event[key]);
  return hasDetails ? { type: RACE_READY_TYPES[type], event } : null;
}
function workoutFromRaceReady({ type, event }) {
  const number = key => parseNumber(String(event[key] ?? "")) ?? undefined;
  const seconds = key => (event[key] ? toSeconds(event[key]) : 0) || undefined;
  const tri = type === "triathlon";
  const has = leg => tri || type === leg;
  const w = { ...blankWorkout("race"), type, setBy: "distance",
    name: event.raceName || undefined, date: event.raceDate || undefined, start: event.raceStart || undefined,
    environment: type === "swim" && event.swimType === "Pool" ? "indoor" : "outdoor",
    // Race Ready's wetsuit rule: compulsory means one, not allowed means none
    wetsuit: { Compulsory: "yes", "Not allowed": "no" }[event.wetsuitRule] };
  // Paces and speed from the goal times, when there are some
  if (has("swim")) {
    w.swimDistance = number("swimDistance");
    const goal = seconds("goalSwimTime");
    if (goal && w.swimDistance) w.swimPace = Math.round(goal / (w.swimDistance / 100));
  }
  if (has("bike")) {
    w.bikeDistance = number("bikeDistance");
    const goal = seconds("goalBikeTime");
    if (goal && w.bikeDistance) w.bikeSpeed = Math.round(w.bikeDistance / (goal / 3600) * 10) / 10;
  }
  if (has("run")) {
    w.runDistance = number("runDistance");
    const goal = seconds("goalRunTime");
    if (goal && w.runDistance) w.runPace = Math.round(goal / w.runDistance);
  }
  if (tri) {
    w.t1Time = seconds("goalT1Time");
    w.t2Time = seconds("goalT2Time");
    w.bikeElevation = number("bikeElevation");
    w.runElevation = number("runElevation");
  } else if (type === "bike") w.elevation = number("bikeElevation");
  else if (type === "run") w.elevation = number("runElevation");
  Object.keys(w).forEach(key => { if (w[key] === undefined) delete w[key]; });
  return w;
}
const importBlock = document.getElementById("importBlock");
const importNote = document.getElementById("importNote");
const IMPORT_NOTE = importNote.textContent;
const importDialog = document.getElementById("importDialog");
const showImport = () => { importBlock.hidden = !raceReadyEvent(); };
function importRaceReady() {
  const found = raceReadyEvent();
  if (!found) return showImport();
  settings.workouts.race = workoutFromRaceReady(found);
  settings.workoutMode = "race";
  openAidId = null;
  saveSettings();
  renderWorkout();
  importNote.textContent = `Imported ${settings.workouts.race.name || "your race"} from Race Ready.`;
}
document.getElementById("importRaceReady").addEventListener("click", () => {
  // Ask first if the race has anything in it beyond the sweat test
  const w = settings.workouts.race;
  const inUse = Object.keys(w).some(key => !(key in blankWorkout("race")) && key !== "aidStations"
    && w[key] !== undefined) || w.aidStations.length > 0;
  if (inUse) importDialog.showModal(); else importRaceReady();
});
document.getElementById("importCancel").addEventListener("click", () => importDialog.close());
importDialog.addEventListener("click", e => { if (e.target === importDialog) importDialog.close(); }); // tap outside
document.getElementById("importConfirm").addEventListener("click", () => { importDialog.close(); importRaceReady(); });
// Race Ready open in another tab saves to the shared storage: offer the import then
window.addEventListener("storage", e => { if (e.key === RACE_READY_KEY) { showImport(); importNote.textContent = IMPORT_NOTE; } });
// Nutrition maths. Carbs during go by how long the session is (CARB_GUIDANCE,
// g per hour), capped by gut training when it's set, at 60 g/h when every carb
// product in My products is glucose only, and at 60 g/h over 4 hours unless
// there's a glucose + fructose product. The timeline spaces feeds of your
// first gel or chew at the top of that target (after any carbs from a drink mix
// in the hydration plan), starting with a gel 15 minutes before the start.
// Before and after go by body weight: carb loading tiered by session length
// (CARB_LOADING), shown per day with kcal; a pre-race meal of 1 g/kg up to 1
// g/kg for each hour before the start (at most 4 g/kg), eaten the number of
// hours before set in Settings; recovery 1.0–1.2 g/kg of carbs an hour for the
// first few hours, with about 0.3 g/kg of protein, stressed only when training
// again within 8 hours.
const CARB_GUIDANCE = [
  { upTo: 45 * 60, min: 0, max: 0 },
  { upTo: 75 * 60, min: 0, max: 30 },
  { upTo: 150 * 60, min: 30, max: 60 },
  { upTo: 240 * 60, min: 60, max: 90 },
  { upTo: Infinity, min: 60, max: 90, maxNeedsDual: true } // 90 only with glucose + fructose
];
const GLUCOSE_ONLY_MAX = 60;       // g/h the gut can take from glucose alone
const CARB_PRODUCT_TYPES = ["gel", "chew", "bar", "drink"];
const CARB_LOADING = [
  { over: 90 * 60, upTo: 150 * 60, perKgPerDay: [7, 8], when: "The day before" },
  { over: 150 * 60, upTo: 240 * 60, perKgPerDay: [8, 10], when: "Each day for the 36 hours before" },
  { over: 240 * 60, upTo: Infinity, perKgPerDay: [10, 12], when: "Each day for the 36–48 hours before" }
];
const KCAL_PER_GRAM_CARB = 4;
const PRE_MEAL = { perKgLow: 1, perKgPerHour: 1, maxPerKg: 4, defaultHours: 2 };
const RECOVERY = { carbsPerKgPerHour: [1.0, 1.2], proteinPerKg: 0.3, withinMinutes: 30 };
const FEEDS = { preStartMinutes: 15, stepMinutes: 5, stopBeforeFinishMinutes: 20, fallbackGel: { name: "gel", carbs: 22 } };

const roundTo = (value, step) => Math.round(value / step) * step;
const formatRange = ([low, high], unit) => (low === high ? `${low} ${unit}` : `${low}–${high} ${unit}`);
// A time from the start as h:mm, e.g. 0:45, or −0:15 before the start
function formatClock(seconds) {
  const minutes = Math.round(Math.abs(seconds) / 60);
  return `${seconds < 0 ? "−" : ""}${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
}
// "06:30" minus some hours, as a time of day
function timeOfDayMinus(time, hours) {
  const [h, m] = time.split(":").map(Number);
  const minutes = ((h * 60 + m - hours * 60) % 1440 + 1440) % 1440;
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

// Carbs during: guidance for the session length, the caps, the target in g/h,
// and the hours you can eat in (none on a swim; bike and run in a triathlon)
function carbPlan(w = workout()) {
  const seconds = workoutSeconds();
  if (!seconds) return null;
  const guidance = CARB_GUIDANCE.find(band => seconds < band.upTo);
  const carbProducts = settings.products.filter(p => CARB_PRODUCT_TYPES.includes(p.type) && p.carbs > 0);
  const hasDual = carbProducts.some(p => p.carbType === "dual");
  const glucoseOnly = carbProducts.length > 0 && carbProducts.every(p => p.carbType === "glucose");
  // Over 4 hours, 90 g/h needs a glucose + fructose product
  const bandMax = guidance.maxNeedsDual && !hasDual ? GLUCOSE_ONLY_MAX : guidance.max;
  const productCap = glucoseOnly ? GLUCOSE_ONLY_MAX : null;
  const cap = gutCarbCap();
  const limit = g => Math.min(g, productCap ?? Infinity, cap ?? Infinity);
  const target = [limit(guidance.min), limit(bandMax)];
  const eatingSeconds = w.type === "swim" ? 0
    : w.type === "triathlon" ? legWindows(w).filter(l => l.leg !== "swim").reduce((t, l) => t + l.end - l.start, 0)
    : seconds;
  const total = target.map(g => roundTo(g * eatingSeconds / 3600, 5));
  return { seconds, guidance, bandMax, glucoseOnly, hasDual, cap, target, eatingSeconds, total };
}

// Carbs an hour from a drink mix in the hydration plan (when it's the mix used)
function drinkMixCarbsPerHour(w) {
  const plan = hydrationPlan(w);
  if (!plan || plan.toThirst || !plan.sodiumMg) return { perHour: 0 };
  const mixSource = sodiumSources(w, plan).sources.find(s => s.mix && s.product.type === "drink" && s.product.carbs > 0);
  return mixSource ? { perHour: mixSource.servings * mixSource.product.carbs / plan.hours, source: mixSource } : { perHour: 0 };
}

// Gel feeds: the first gel or chew in My products (or a 22 g gel), at the top
// of the capped target less any drink-mix carbs. The first is 15 minutes
// before the start; then one every interval (the gel's carbs ÷ rate, to the
// nearest 5 min), stopping when the next would be under 20 minutes from the
// finish, or the carbs so far are within half a serving of the total. In a
// triathlon, feeds only go in the bike and run: one that would land in the
// swim or a transition moves to the start of the next leg.
function carbFeeds(w = workout(), plan = carbPlan(w)) {
  const product = settings.products.find(p => ["gel", "chew"].includes(p.type) && p.carbs > 0);
  const gel = product ? { name: productTitle(product), carbs: product.carbs, product } : FEEDS.fallbackGel;
  const none = { gel, feeds: [], count: 0, grams: 0, limited: false };
  if (!plan || plan.target[1] === 0) return none;
  const preStart = -FEEDS.preStartMinutes * 60;
  const feeds = [];
  const add = time => feeds.push({ time, soFar: (feeds.length + 1) * gel.carbs });
  // Swims: just the one before the start
  if (w.type === "swim") { add(preStart); return { ...none, feeds, count: 1, grams: gel.carbs }; }
  const rate = plan.target[1] - drinkMixCarbsPerHour(w).perHour;
  if (rate <= 0) return none;
  const interval = Math.max(FEEDS.stepMinutes, roundTo(gel.carbs / rate * 60, FEEDS.stepMinutes)) * 60;
  const windows = w.type === "triathlon" ? legWindows(w).filter(l => l.leg !== "swim") : [{ start: 0, end: plan.seconds }];
  const finish = windows[windows.length - 1].end;
  const total = rate * plan.eatingSeconds / 3600;
  const max = product?.maxPerDay || Infinity;
  let limited = false;
  add(preStart);
  for (let time = preStart + interval; ; time += interval) {
    if (feeds.length * gel.carbs >= total - gel.carbs / 2) break;
    // Outside the bike and run (the swim or a transition): the start of the next leg
    if (!windows.some(l => time >= l.start && time < l.end)) {
      const next = windows.find(l => l.start > time);
      if (!next) break;
      time = next.start;
    }
    if (time > finish - FEEDS.stopBeforeFinishMinutes * 60) break;
    if (feeds.length >= max) { limited = true; break; }
    add(time);
  }
  return { gel, feeds, count: feeds.length, grams: feeds.length * gel.carbs, limited, max };
}

const result = key => document.querySelector(`[data-result="${key}"]`);
function setResult(key, text, isSet = true) {
  const el = result(key);
  el.textContent = text;
  el.classList.toggle("is-set", isSet && el.tagName === "OUTPUT");
}

function renderNutrition(w) {
  const plan = carbPlan(w);
  const weight = fields.weight;

  // During: carbs per hour, total, and the guidance beside the caps
  if (!plan) {
    ["carbsPerHour", "carbsTotal"].forEach(key => setResult(key, key === "carbsPerHour" ? "– g/h" : "– g", false));
    setResult("carbGuidance", "Add the duration on the Event page", false);
    setResult("carbGap", "");
  } else if (w.type === "swim") {
    setResult("carbsPerHour", "None during");
    setResult("carbsTotal", "0 g");
    setResult("carbGuidance", "Fuel before and after instead", false);
    setResult("carbGap", "");
  } else {
    const { guidance, bandMax, glucoseOnly, hasDual, cap, target, total } = plan;
    const none = guidance.max === 0;
    setResult("carbsPerHour", none ? "None needed" : formatRange(target, "g/h"));
    setResult("carbsTotal", none ? "0 g" : formatRange(total, "g"));
    const parts = [none ? "None needed under 45 minutes" : `Guidance ${formatRange([guidance.min, guidance.max], "g/h")}`];
    if (!none) {
      if (glucoseOnly && guidance.max > GLUCOSE_ONLY_MAX) parts.push(`capped at ${GLUCOSE_ONLY_MAX} g/h: your carb products are glucose only`);
      else if (guidance.maxNeedsDual && !hasDual) parts.push(`${GLUCOSE_ONLY_MAX} g/h without a glucose + fructose product`);
      const upper = Math.min(bandMax, glucoseOnly ? GLUCOSE_ONLY_MAX : Infinity);
      parts.push(cap == null ? "no gut training set, so no cap"
        : cap < upper ? `capped at ${displayNumber(cap, 0)} g/h by your gut training`
        : `within your gut training (${displayNumber(cap, 0)} g/h)`);
    }
    setResult("carbGuidance", parts.join(" · "), false);
    // The gap is what tells you to train your gut
    setResult("carbGap", cap != null && cap < guidance.min
      ? `${displayNumber(guidance.min - cap, 0)} g/h under the guidance. Training your gut would close the gap.` : "");
  }

  // Timeline: gel feeds with a running total, and (for triathlon) each leg with its part
  const { gel, feeds, count, grams, limited, max } = carbFeeds(w, plan);
  const rows = feeds.map(({ time, soFar }) => ({ time, what: `1 × ${gel.name}`, detail: `${soFar} g so far` }));
  legWindows(w).forEach(({ leg, name, start }) => rows.push({ time: start, what: name, detail: LEG_ROLES[leg].nutrition, kind: "leg" }));
  rows.sort((a, b) => a.time - b.time || (a.kind === "leg" ? -1 : 1)); // a leg heads any feed at its start
  const timeline = result("carbTimeline");
  timeline.textContent = "";
  rows.forEach(({ time, what, detail, kind }) => {
    const item = document.createElement("li");
    item.className = "timeline__item" + (kind ? ` timeline__item--${kind}` : "");
    const clock = document.createElement("span");
    clock.className = "timeline__time";
    clock.textContent = formatClock(time);
    const text = document.createElement("span");
    text.className = "timeline__what";
    text.textContent = what;
    if (detail) { const sub = document.createElement("span"); sub.textContent = detail; text.append(sub); }
    item.append(clock, text);
    timeline.append(item);
  });
  timeline.closest(".field-group").hidden = rows.length === 0;
  setResult("timelineNote", !plan ? "Add the duration on the Event page to see when to take what."
    : rows.length === 0 ? "No gels needed for this one."
    : `${count} × ${gel.name}, ${grams} g. Times from the start; −0:15 is 15 minutes before.`
      + (limited ? ` Limited to ${max} a day, the label's maximum.` : "")
      + (gel.product ? "" : " Add your gels in Settings to use them here."));

  // From your products: servings of the gel (and any drink mix) in this plan
  const productOutputs = key => document.querySelectorAll(`#view-nutrition [data-result="${key}"]`);
  document.querySelectorAll('#view-nutrition [data-result^="servings-"]').forEach(el => { el.textContent = "Not in this plan"; el.classList.remove("is-set"); });
  if (gel.product && count) productOutputs(`servings-${gel.product.id}`).forEach(el => {
    el.textContent = `${count} serving${count === 1 ? "" : "s"}, ${grams} g`;
    el.classList.add("is-set");
  });
  const drinkMix = plan && w.type !== "swim" ? drinkMixCarbsPerHour(w).source : null;
  if (drinkMix) productOutputs(`servings-${drinkMix.product.id}`).forEach(el => {
    el.textContent = `${drinkMix.servings} serving${drinkMix.servings === 1 ? "" : "s"}, ${drinkMix.servings * drinkMix.product.carbs} g, in your bottles`;
    el.classList.add("is-set");
  });

  // Before and after, by body weight
  document.querySelector("[data-needs-weight]").hidden = weight != null;
  const perKg = values => (weight == null ? null : values.map(v => roundTo(v * weight, 5)));

  // Carb loading: sessions over 90 minutes only, tiered by length, per day with kcal
  const tier = plan && CARB_LOADING.find(t => plan.seconds > t.over && plan.seconds <= t.upTo);
  document.querySelector("[data-carb-loading]").hidden = !tier;
  if (tier) {
    const loading = perKg(tier.perKgPerDay);
    setResult("loadPerDay", loading ? formatRange(loading, "g") : "– g", !!loading);
    setResult("loadKcal", loading ? `${formatRange(loading.map(g => displayNumber(g * KCAL_PER_GRAM_CARB, 0)), "kcal")}` : "");
    setResult("loadPerKg", formatRange(tier.perKgPerDay, "g/kg"), false);
    setResult("loadWhen", tier.when, false);
  }

  // Pre-race meal: 1 g/kg, up to 1 g/kg for each hour before (at most 4 g/kg),
  // the hours before set in Settings
  const hours = parseFloat(fields.mealHours) || PRE_MEAL.defaultHours;
  const hoursText = displayNumber(hours, 1);
  setResult("mealHeading", settings.workoutMode === "race" ? "Pre-race meal" : "Pre-workout meal");
  setResult("mealTime", w.start ? timeOfDayMinus(w.start, hours) : `${hoursText} h before`, !!w.start);
  const meal = perKg([PRE_MEAL.perKgLow, Math.min(PRE_MEAL.maxPerKg, hours * PRE_MEAL.perKgPerHour)]);
  setResult("mealCarbs", meal ? formatRange(meal, "g") : "– g", !!meal);
  setResult("mealNote", `${hoursText} hours before the start (set in Settings): 1 g/kg, up to 1 g/kg for each hour before.`
    + (meal && w.type === "run" ? ` Runs: go for the lower end, about ${meal[0]} g.` : "")
    + (w.start ? "" : " Add a start time on the Event page for a clock time."));

  // Recovery: stressed when training again within about 8 hours
  const soon = settings.workoutMode === "training" && w.nextSoon === "yes";
  const carbs = perKg(RECOVERY.carbsPerKgPerHour);
  const protein = perKg([RECOVERY.proteinPerKg]);
  setResult("recoveryCarbs", carbs ? formatRange(carbs, "g") : "– g", !!carbs && soon);
  setResult("recoveryProtein", protein ? `${protein[0]} g` : "– g", !!protein && soon);
  setResult("recoveryWhen", soon ? `Within ${RECOVERY.withinMinutes} min, then each hour for the first few hours` : "At your next meal", soon);
  setResult("recoveryNote", soon
    ? "You're training again within 8 hours, so start refuelling straight away: 1.0–1.2 g/kg of carbs an hour, and about 0.3 g/kg of protein."
    : "Recovery matters most when you train again within about 8 hours. Otherwise normal meals cover it, aiming for about 0.3 g/kg of protein.");
}

// Hydration maths.
// Sweat rate for the event: your baseline (sweatBaseline) scaled for the
// event's temperature, humidity, indoors, effort and sport. These factors are
// starting assumptions, not from a source: change them here.
const SWEAT_SCALING = {
  perDegreeHotter: 0.03, perDegreeCooler: 0.02,   // per °C away from the baseline's temperature
  humidityFrom: 60, perHumidityPercent: 0.005, humidityMax: 0.2,
  indoor: 0.15,                                    // little airflow on a turbo or treadmill
  effort: { easy: 0.8, steady: 1.0, tempo: 1.15, race: 1.25, hard: 1.3 },
  sport: { run: 1.0, bike: 0.9, other: 1.0 },
  min: 0.5
};
// Race goals and interval sessions as an effort
const GOAL_EFFORT = { finish: "steady", strong: "tempo", pb: "race", allout: "hard" };
const INTENSITY_NAME_EFFORT = { "Easy": "easy", "Steady": "steady", "Tempo": "tempo", "Race pace": "race" };
// Drinking. The target is what you need to keep sweat loss to about 2% of body
// weight: need (L/h) = max(0, S × T − 0.02 × W) ÷ T, for sweat rate S, drinking
// hours T and weight W. It's capped at the sport's ceiling (run 0.8, bike 1.0
// L/h; each triathlon leg its own) and never above S; under an hour, drink to
// thirst. What you'll actually drink is the target or what you can get,
// whichever is less: what you carry (the bike bottles in Settings; on the run,
// a handheld or vest set on the Event page) plus cups at aid stations.
const DRINKING = { keepLossToPercent: 2, ceiling: { run: 0.8, bike: 1.0, other: 0.8 }, thirstUnderSeconds: 60 * 60 };
const AID_CUP_ML = 150; // an assumption: one cup at each aid station with water or course drink
// Where you drink from when a race doesn't say: bottles on the bike, aid stations on the run
const DRINK_FROM_DEFAULT = { bike: "bottles", run: "aid", other: "bottles" };
const WEIGHT_LOSS_WARNING_PERCENT = 3;
const REHYDRATE_LITRES_PER_KG = [1.25, 1.5];
// Sodium during: what you'll drink × your sweat sodium (PF&H), not your whole
// sweat loss, counting the sodium already in gels and course drinks. Optional
// for events under 2 h 30 below 25 °C. Your mix only goes in what you carry:
// whole or half tablets, at most 2 per bottle, never stronger than the
// product's own serving, and within its daily limit.
const SODIUM_OPTIONAL = { underSeconds: 150 * 60, belowTemperature: 25 };
const MIX = { maxPerBottle: 2 };
// Pre-loading (PF&H): 750 mg of sodium in 500 ml (1,500 mg/L), twice: the
// evening before, and from 90 to 45 minutes before the start. Recommended for
// events over 2 hours or 25 °C, or salty sweaters; otherwise optional. The
// race-day dose counts towards the product's daily limit; the evening one is
// the day before, so it doesn't.
const PRELOAD = { sodiumMg: 750, fluidMl: 500, startMinutesBefore: 90, finishMinutesBefore: 45, hotFrom: 25, longerThanSeconds: 2 * 60 * 60 };

function eventEffort(w) {
  if (settings.workoutMode === "race") return GOAL_EFFORT[w.goal] || "tempo";
  if (usesIntervals(w)) return INTENSITY_NAME_EFFORT[intervalPlan(w)?.name] || "steady";
  return SWEAT_SCALING.effort[w.intensity] ? w.intensity : "steady";
}
// Estimated sweat rate (L/h) for a sport in this event, or null without a baseline
function eventSweatRate(w, sport) {
  const base = sweatBaseline();
  if (!base) return null;
  const s = SWEAT_SCALING;
  const air = eventConditions(w).air || MILD_CONDITIONS;
  const degrees = air.temperature - base.temperature;
  const heat = 1 + (degrees >= 0 ? s.perDegreeHotter : s.perDegreeCooler) * degrees;
  const humidity = 1 + Math.min(s.humidityMax, Math.max(0, (air.humidity - s.humidityFrom) * s.perHumidityPercent));
  const indoor = w.environment === "indoor" ? 1 + s.indoor : 1;
  const effort = s.effort[eventEffort(w)] / (s.effort[base.effort] || 1);
  const sportFactor = (s.sport[sport] || 1) / (s.sport[base.sport] || s.sport[sport] || 1);
  return base.rate * Math.max(s.min, heat) * humidity * indoor * effort * sportFactor;
}
// The parts of the event you can drink in: the whole session, or a
// triathlon's bike and run; none for a swim
function drinkingParts(w) {
  if (w.type === "swim") return [];
  if (w.type === "triathlon") return legWindows(w).filter(l => l.leg !== "swim").map(l => ({ sport: l.leg, seconds: l.end - l.start }));
  const seconds = workoutSeconds();
  return seconds ? [{ sport: w.type === "other" ? "other" : w.type, seconds }] : [];
}

// How you drink in one part: from what you carry, aid stations, or both.
// Training uses what you carry; races say on the Event page (per leg for
// triathlon). The bike bottles in Settings are bike kit; on the run you carry
// a handheld or vest if one is set, never bottles.
function drinkingSetup(w, sport) {
  const race = settings.workoutMode === "race";
  const key = w.type === "triathlon" ? `${sport}DrinkFrom` : "drinkFrom";
  const from = race ? (w[key] || DRINK_FROM_DEFAULT[sport]) : "bottles";
  let container = null;
  if (sport === "run") {
    if (w.runCarry && w.runCarry !== "none" && w.runCarryVolume > 0) container = { kind: w.runCarry, ml: w.runCarryVolume, count: 1 };
  } else if (fields.bottleSize > 0 && fields.bottleCount > 0) {
    container = { kind: "bottle", ml: fields.bottleSize, count: fields.bottleCount };
  }
  const stations = !race ? [] : w.aidStations.filter(s => (w.type !== "triathlon" || (s.leg || "bike") === sport)
    && (s.items || []).some(item => item === "water" || item === "drink"));
  const usesCarried = from !== "aid", usesAid = from !== "bottles";
  return {
    from, race,
    container: usesCarried ? container : null,
    stations: usesAid ? stations : [],
    carriedL: usesCarried && container ? container.ml * container.count / 1000 : 0,
    aidL: usesAid ? stations.length * AID_CUP_ML / 1000 : 0,
    needsStations: race && usesAid && !usesCarried && stations.length === 0
  };
}

function hydrationPlan(w = workout()) {
  const parts = drinkingParts(w);
  const seconds = parts.reduce((t, p) => t + p.seconds, 0);
  if (!seconds || !sweatBaseline()) return null;
  const weight = fields.weight;
  const toThirst = workoutSeconds() < DRINKING.thirstUnderSeconds;
  const legs = parts.map(({ sport, seconds: s }) => {
    const rate = eventSweatRate(w, sport);
    const hours = s / 3600;
    return { sport, hours, rate, sweat: rate * hours, ...drinkingSetup(w, sport) };
  });
  const sweatLitres = legs.reduce((t, l) => t + l.sweat, 0);
  // The 2% allowance, shared across the legs by how much each sweats
  const allowance = weight ? weight * DRINKING.keepLossToPercent / 100 : 0;
  legs.forEach(leg => {
    const need = Math.max(0, leg.sweat - allowance * leg.sweat / sweatLitres) / leg.hours;
    leg.ceiling = Math.min(DRINKING.ceiling[leg.sport] ?? DRINKING.ceiling.other, leg.rate);
    leg.capped = !toThirst && need > leg.ceiling;
    leg.targetPerHour = toThirst ? 0 : Math.min(need, leg.ceiling);
    leg.target = leg.targetPerHour * leg.hours;
    leg.planned = Math.min(leg.target, leg.carriedL + leg.aidL);
    leg.fromCarried = Math.min(leg.planned, leg.carriedL);
    leg.fromAid = leg.planned - leg.fromCarried;
    // Bottles (or the run's handheld or vest) actually used
    leg.containersUsed = leg.container && leg.fromCarried > 0 ? Math.ceil(leg.fromCarried * 1000 / leg.container.ml - 1e-9) : 0;
  });
  const hours = seconds / 3600;
  const targetLitres = legs.reduce((t, l) => t + l.target, 0);
  const plannedLitres = legs.reduce((t, l) => t + l.planned, 0);
  const lossKg = Math.round(Math.max(0, sweatLitres - plannedLitres) * 10) / 10; // 1 L of sweat ≈ 1 kg; to 0.1 kg
  const sodiumMg = plannedLitres * sweatSodiumMgPerL();
  const air = eventConditions(w).air;
  const sodiumOptional = workoutSeconds() < SODIUM_OPTIONAL.underSeconds && (air?.temperature ?? MILD_CONDITIONS.temperature) < SODIUM_OPTIONAL.belowTemperature;
  return { legs, hours, toThirst, sweatLitres, sweatPerHour: sweatLitres / hours, targetLitres, targetPerHour: targetLitres / hours,
    plannedLitres, plannedPerHour: plannedLitres / hours, lossKg, lossPercent: weight ? lossKg / weight * 100 : null,
    sodiumMg, sodiumPerHour: sodiumMg / hours, sodiumOptional };
}

// Fluid amounts for display: ml under a litre, then litres; or fl oz
function formatFluid(litres, perHour = false) {
  const unit = perHour ? "/h" : "";
  if (settings.units.fluid === "imperial") return `${Math.round(litres * 1000 / ML_PER_FL_OZ)} fl oz${unit}`;
  return litres < 1 ? `${roundTo(litres * 1000, 50)} ml${unit}` : `${litres.toFixed(1)} L${unit}`;
}
// A range in one unit: "1.3–1.5 L", "600–750 ml" or "44–51 fl oz"
function formatFluidRange(low, high) {
  if (settings.units.fluid === "imperial") return `${Math.round(low * 1000 / ML_PER_FL_OZ)}–${Math.round(high * 1000 / ML_PER_FL_OZ)} fl oz`;
  return high < 1 ? `${roundTo(low * 1000, 50)}–${roundTo(high * 1000, 50)} ml` : `${low.toFixed(1)}–${high.toFixed(1)} L`;
}
const formatMg = mg => `${displayNumber(roundTo(mg, 50), 0)} mg`;
const halves = n => `${Math.floor(n) || ""}${n % 1 ? "½" : ""}`; // 0.5 -> "½", 1.5 -> "1½"
const CONTAINER_NAMES = { bottle: "bottle", handheld: "handheld", vest: "vest" };

// Your sodium product: an electrolyte tab first, or else a drink mix with sodium
const sodiumProduct = () => settings.products.find(p => p.type === "tab" && p.sodium > 0) || settings.products.find(p => p.type === "drink" && p.sodium > 0);

// Pre-loading: recommended or optional, and servings of your sodium product
function preloadPlan(w) {
  const air = eventConditions(w).air;
  const reasons = [];
  if (workoutSeconds() > PRELOAD.longerThanSeconds) reasons.push("it's over 2 hours");
  if (air?.isSet && air.temperature > PRELOAD.hotFrom) reasons.push("it's over 25 °C");
  const salt = currentSaltBand();
  if (salt.isSet && salt.band.name === "High") reasons.push("you're a salty sweater");
  const product = sodiumProduct();
  const servings = product ? Math.max(1, Math.round(PRELOAD.sodiumMg / product.sodium)) : 0;
  const recommended = reasons.length > 0;
  return { recommended, reasons, product, servings, sodium: product ? servings * product.sodium : 0,
    raceDayServings: recommended ? servings : 0 };
}

// Where the sodium during comes from: gels (the Nutrition timeline's feeds when
// given; otherwise an estimate from the carb target, used while working out
// whether a drink mix supplies carbs), the course drink in the aid-station cups
// you drink, and the rest from your mix in what you carry
function sodiumSources(w, plan, feeds = null) {
  const sources = [];
  let remaining = plan.sodiumMg;
  if (feeds) {
    if (feeds.gel.product && feeds.count) sources.push({ product: feeds.gel.product, servings: feeds.count, sodium: feeds.count * (feeds.gel.product.sodium || 0) });
  } else {
    const carbs = carbPlan(w);
    const gel = settings.products.find(p => ["gel", "chew"].includes(p.type) && p.carbs > 0);
    if (gel && carbs && carbs.eatingSeconds) {
      const grams = (carbs.target[0] + carbs.target[1]) / 2 * carbs.eatingSeconds / 3600;
      const servings = Math.ceil(grams / gel.carbs);
      if (servings > 0) sources.push({ product: gel, servings, sodium: servings * (gel.sodium || 0) });
    }
  }
  const courseDrink = settings.workoutMode === "race" && settings.products.find(p => p.id === w.courseDrink);
  const cups = courseDrink ? plan.legs.reduce((n, leg) => n + leg.stations.filter(s => s.items.includes("drink")).length, 0) : 0;
  if (cups && courseDrink.sodium && courseDrink.volume) {
    sources.push({ product: courseDrink, cups, sodium: cups * AID_CUP_ML * courseDrink.sodium / courseDrink.volume, course: true });
  }
  sources.forEach(s => { remaining -= s.sodium; });

  // Your mix, in each bottle (or handheld or vest) you use
  const mix = sodiumProduct();
  const carriers = plan.legs.filter(l => l.containersUsed > 0);
  const containers = carriers.reduce((n, l) => n + l.containersUsed, 0);
  let perContainer = [], servings = 0, limited = false, allowed = Infinity;
  if (mix && containers && remaining > 0) {
    const wanted = Math.round(remaining / mix.sodium / containers * 2) / 2;
    const strength = leg => (mix.volume ? Math.floor(leg.container.ml / mix.volume * 2) / 2 : Infinity);
    perContainer = carriers.map(leg => ({ leg, each: Math.min(MIX.maxPerBottle, strength(leg), wanted) }));
    servings = perContainer.reduce((n, c) => n + c.each * c.leg.containersUsed, 0);
    // Within the daily limit, after the race-day pre-load
    allowed = mix.maxPerDay ? Math.max(0, mix.maxPerDay - preloadPlan(w).raceDayServings) : Infinity;
    if (servings > allowed) {
      limited = true;
      const each = Math.floor(allowed / containers * 2) / 2;
      perContainer = perContainer.map(c => ({ ...c, each: Math.min(c.each, each) }));
      servings = perContainer.reduce((n, c) => n + c.each * c.leg.containersUsed, 0);
    }
    if (servings > 0) sources.push({ product: mix, servings, sodium: servings * mix.sodium, mix: true });
  }
  const shortfall = Math.max(0, remaining - (servings * (mix?.sodium || 0)));
  return { sources, mix, perContainer: perContainer.filter(c => c.each > 0), servings, limited, allowed, shortfall, carried: containers > 0 };
}

function renderHydration(w) {
  const plan = hydrationPlan(w);
  const swim = w.type === "swim";
  document.querySelector("[data-hydration-swim-note]").hidden = !swim;
  const warnings = [];
  const set = (key, text, isSet = true) => document.querySelectorAll(`#view-hydration [data-result="${key}"]`).forEach(el => {
    el.textContent = text;
    el.classList.toggle("is-set", isSet && el.tagName === "OUTPUT");
  });
  const drinking = plan && !plan.toThirst && !swim;

  // Fluid: target, what you'll drink and where from, sweat, expected loss
  if (swim) {
    set("fluidPerHour", "None during"); set("fluidTotal", "–", false); set("fluidTotalNote", "");
    set("sweatEstimate", "–", false); set("sweatBasis", "");
    set("weightLoss", "–", false); set("weightLossNote", "");
  } else if (!plan) {
    const why = !sweatBaseline() ? "Set how much you sweat in Settings" : "Add the duration on the Event page";
    set("fluidPerHour", `– ${unitFor("volume").label}/h`, false); set("fluidTotal", `– ${unitFor("volume").label}`, false); set("fluidTotalNote", "");
    set("sweatEstimate", why, false); set("sweatBasis", "");
    set("weightLoss", "–", false); set("weightLossNote", "");
  } else {
    set("fluidPerHour", plan.toThirst ? "Drink to thirst" : formatFluid(plan.targetPerHour, true));
    set("fluidTotal", plan.toThirst ? "–" : formatFluid(plan.plannedLitres), !plan.toThirst);
    const where = [];
    plan.legs.forEach(leg => {
      const prefix = plan.legs.length > 1 ? `${leg.sport === "bike" ? "Bike" : "Run"}: ` : "";
      const bits = [];
      if (leg.containersUsed) bits.push(leg.container.kind === "bottle"
        ? `${leg.containersUsed} × ${formatWithUnit("volume", leg.container.ml)} bottle${leg.containersUsed === 1 ? "" : "s"}`
        : `your ${formatWithUnit("volume", leg.container.ml)} ${CONTAINER_NAMES[leg.container.kind]}`);
      if (leg.fromAid > 0) bits.push(`${Math.ceil(leg.fromAid * 1000 / AID_CUP_ML - 1e-9)} × ${formatWithUnit("volume", AID_CUP_ML)} at aid stations`);
      if (leg.needsStations) bits.push("add aid stations on the Event page");
      else if (!bits.length && !plan.toThirst) bits.push(leg.sport === "run" ? "nothing carried: set a handheld or vest on the Event page" : "add your bottles in Settings");
      where.push(prefix + bits.join(" and "));
    });
    const short = !plan.toThirst && plan.plannedLitres < plan.targetLitres - 0.05;
    set("fluidTotalNote", plan.toThirst ? "" : (short ? `Of a ${formatFluid(plan.targetLitres)} target. ` : "") + where.join(" · ").replace(/^./, c => c.toUpperCase()));
    set("sweatEstimate", `${formatFluid(plan.sweatPerHour, true)}, ${formatFluid(plan.sweatLitres)} in all`);
    set("sweatBasis", `From your ${sweatBaseline().measured ? "measured rate" : "sweat level"}, adjusted for the conditions and effort`);
    if (plan.lossPercent == null) {
      set("weightLoss", `${plan.lossKg.toFixed(1)} kg`); set("weightLossNote", "Add your weight in Settings for a percentage");
    } else {
      set("weightLoss", `${plan.lossPercent.toFixed(1)}% (${plan.lossKg.toFixed(1)} kg)`);
      set("weightLossNote", `${plan.lossPercent > WEIGHT_LOSS_WARNING_PERCENT ? "Over" : "Under"} 3% of your body weight` + (short ? ", with what you can drink" : ""));
      if (plan.lossPercent > WEIGHT_LOSS_WARNING_PERCENT) warnings.push(`<strong>Over 3% weight loss.</strong> Performance drops and heat illness gets more likely. ${short ? "Carry more or use more aid stations if you can, " : ""}slow down in the heat, and rehydrate after.`);
    }
    plan.legs.filter(l => l.capped).forEach(leg => warnings.push(`<strong>Capped at ${formatFluid(DRINKING.ceiling[leg.sport] ?? DRINKING.ceiling.other, true)}${plan.legs.length > 1 ? ` on the ${leg.sport}` : ""}.</strong> You'll sweat about ${formatFluid(leg.rate, true)}, but drinking more than this risks low blood sodium (hyponatremia).`));
  }
  const warning = document.querySelector('[data-result="fluidWarning"]');
  warning.hidden = warnings.length === 0;
  warning.innerHTML = warnings.join("<br>"); // fixed text and numbers only (no user input)

  // Bottles: only when bottles (or a run handheld or vest) are used
  const carriers = drinking ? plan.legs.filter(l => l.containersUsed) : [];
  if (swim) set("bottles", "Not needed during", false);
  else if (!drinking) set("bottles", plan?.toThirst ? "One is plenty" : "–", false);
  else if (!carriers.length) set("bottles", "None", false);
  else set("bottles", carriers.map(l => l.container.kind === "bottle"
    ? `${l.containersUsed} × ${formatWithUnit("volume", l.container.ml)}`
    : `${formatWithUnit("volume", l.container.ml)} ${CONTAINER_NAMES[l.container.kind]} on the run`).join(" · "));
  set("bottleKit", !drinking || carriers.length ? "" : plan.legs.every(l => l.from === "aid") ? "Aid stations only" : "", false);

  // Sodium during, and where it comes from
  document.querySelectorAll('#view-hydration [data-result^="servings-"]').forEach(el => { el.textContent = "Not in this plan"; el.classList.remove("is-set"); });
  if (!drinking || plan.sodiumMg === 0) {
    set("sodiumPerHour", swim ? "None during" : plan?.toThirst ? "Not needed" : "– mg/h", false);
    set("sodiumNote", ""); set("sodiumTotal", "–", false);
    set("mix", plan?.toThirst ? "Water is fine" : "–", false); set("mixNote", ""); set("sodiumSources", "–", false);
  } else {
    set("sodiumPerHour", `${formatMg(plan.sodiumPerHour)}/h`, !plan.sodiumOptional);
    set("sodiumNote", plan.sodiumOptional ? "Optional for this length" : "");
    set("sodiumTotal", formatMg(plan.sodiumMg), !plan.sodiumOptional);
    const { sources, mix, perContainer, servings, limited, allowed, shortfall, carried } = sodiumSources(w, plan, carbFeeds(w));
    set("sodiumSources", sources.length ? sources.map(s => `${productTitle(s.product)} ${formatMg(s.sodium)}`).join(" · ") : "–", sources.length > 0);
    if (!carried) set("mix", "Not in this plan", false); // aid stations only: nothing to mix in
    else if (!mix) set("mix", "Add a drink mix or tabs in Settings", false);
    else if (!perContainer.length) set("mix", "Water: gels and the course cover it");
    else set("mix", perContainer.map(({ leg, each }) => leg.container.kind === "bottle"
      ? `${halves(each)} × ${productTitle(mix)} in each ${formatWithUnit("volume", leg.container.ml)} bottle`
      : `${halves(each)} × ${productTitle(mix)} in your ${CONTAINER_NAMES[leg.container.kind]}`).join(" · "));
    const suggest = "Add a sports electrolyte or salt capsules without a daily limit.";
    set("mixNote", plan.sodiumOptional ? ""
      : limited ? `Limited to ${mix.maxPerDay} a day, the label's maximum${allowed < mix.maxPerDay ? ", counting the pre-load on the day" : ""}, so you'll be about ${formatMg(shortfall)} short. ${suggest}`
      : shortfall >= 50 && carried && mix ? `About ${formatMg(shortfall)} short at the product's strength. ${suggest}` : "");
    sources.forEach(s => document.querySelectorAll(`#view-hydration [data-result="servings-${s.product.id}"]`).forEach(el => {
      el.textContent = s.cups ? `${s.cups} cup${s.cups === 1 ? "" : "s"} on the course` : `${halves(s.servings)} serving${s.servings === 1 ? "" : "s"} during`;
      el.classList.add("is-set");
    }));
  }

  // Pre-loading: 750 mg in 500 ml, the evening before and 90–45 minutes before the start
  const preload = preloadPlan(w);
  set("preloadStatus", preload.recommended ? "Recommended" : "Optional", preload.recommended);
  set("preloadSodium", `${formatMg(PRELOAD.sodiumMg)} in ${formatWithUnit("volume", PRELOAD.fluidMl)}`);
  set("preloadServings", preload.product ? `${preload.servings} × ${productTitle(preload.product)} (${displayNumber(preload.sodium, 0)} mg)` : "Add a tab or drink mix in Settings", !!preload.product);
  set("preloadWhen", w.start
    ? `Evening before, and ${timeOfDayMinus(w.start, PRELOAD.startMinutesBefore / 60)}–${timeOfDayMinus(w.start, PRELOAD.finishMinutesBefore / 60)}`
    : "Evening before, and 90–45 min before the start", !!w.start);
  set("preloadWhy", preload.recommended
    ? `Recommended because ${preload.reasons.join(" and ")}. The race-day dose counts towards the product's daily limit.`
    : "Optional: it's recommended for events over 2 hours or 25 °C, or salty sweaters.");

  // Rehydrating after: 1.25–1.5 L for every kg lost, with some salt
  if (swim || !plan || plan.lossKg < 0.1) {
    set("rehydrate", swim || !plan ? "Drink to thirst" : "Just drink to thirst", false);
    set("rehydrateNote", swim ? "Weigh yourself before and after a swim to learn how much you lose in the water." : "About 1.25–1.5 L for every kg you lose, with some salt.");
  } else {
    const [low, high] = REHYDRATE_LITRES_PER_KG.map(l => l * plan.lossKg);
    set("rehydrate", formatFluidRange(low, high));
    set("rehydrateNote", `About 1.25–1.5 L for every kg you lose (about ${plan.lossKg.toFixed(1)} kg), over the next few hours. Include some salt: salty food or an electrolyte drink.`);
  }
}

// Nutrition and Hydration pages: they only display what's worked out from
// Settings and the Event page's selected workout (training or race): which
// event it's for (the line under the title), the Nutrition and Hydration maths
// (renderNutrition, renderHydration), the saltiness band and your products.
const WORKOUT_TYPE_NAMES = { run: "Run", bike: "Bike", swim: "Swim", triathlon: "Triathlon", other: "Other" };
function renderPlans() {
  const w = workout();
  const seconds = workoutSeconds();
  const hasEvent = !!(w.name?.trim() || seconds);
  document.querySelectorAll("[data-plan-line]").forEach(line => {
    line.textContent = "";
    line.hidden = !hasEvent;
    if (!hasEvent) return;
    // e.g. "Weymouth Triathlon", then "Race · 2:44:30 · 13 Jun 27" on the line below
    const title = document.createElement("strong");
    title.textContent = w.name?.trim() || WORKOUT_TYPE_NAMES[w.type];
    const rest = [settings.workoutMode === "race" ? "Race" : "Training"];
    if (seconds) rest.push(formatHMS(seconds));
    if (w.date) rest.push(formatShortDate(w.date));
    const details = document.createElement("span");
    details.className = "race-line__details";
    details.textContent = rest.join(" · ");
    line.append(title, details);
  });
  document.querySelectorAll("[data-plan-empty]").forEach(note => { note.hidden = hasEvent; });
  document.querySelectorAll("[data-swim-plan-note]").forEach(note => { note.hidden = w.type !== "swim"; });

  // Triathlon: each leg's window and its part in the plan
  const windows = legWindows(w);
  document.querySelectorAll("[data-leg-plan]").forEach(group => {
    const page = group.dataset.legPlan;
    group.textContent = "";
    group.parentElement.hidden = windows.length === 0;
    windows.forEach(({ leg, name, start, end }) => {
      const row = document.createElement("div");
      row.className = "field computed-field";
      const label = document.createElement("span");
      label.textContent = `${name} · ${formatHMS(start)}–${formatHMS(end)}`;
      const role = document.createElement("output");
      role.textContent = LEG_ROLES[leg][page];
      row.append(label, role);
      group.append(row);
    });
  });

  const { band, isSet } = currentSaltBand();
  document.querySelector("[data-salt-band]").textContent = isSet ? `yours is ${band.name.toLowerCase()}` : "set it in Settings";

  // One line per product that could be used, with how many servings (to come)
  document.querySelectorAll("[data-product-totals]").forEach(group => {
    const types = group.dataset.productTotals.split(" ");
    const products = settings.products.filter(product => types.includes(product.type));
    group.textContent = "";
    group.hidden = products.length === 0;
    group.nextElementSibling.hidden = products.length > 0; // the "add your products" note
    products.forEach(product => {
      const row = document.createElement("div");
      row.className = "field computed-field";
      const name = document.createElement("span");
      name.textContent = productTitle(product);
      const amount = document.createElement("output");
      amount.dataset.result = `servings-${product.id}`;
      amount.textContent = "– servings";
      const detail = document.createElement("span");
      detail.className = "computed-field__detail";
      detail.textContent = productSummary(product);
      row.append(name, amount, detail);
      group.append(row);
    });
  });
  // After the product rows, whose servings they fill in
  renderNutrition(w);
  renderHydration(w);
}
// "Go to Event" (shown until the Event page has something in it)
document.querySelectorAll("[data-go-event]").forEach(button =>
  button.addEventListener("click", () => tabs[VIEWS.indexOf("event")].click()));
settingsDialog.addEventListener("close", renderPlans); // products, gut or saltiness may have changed

showImport();
renderWorkout();

// PWA: register the service worker (needs http(s), so skipped on file://)
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(registration => {
      // Home-screen apps are often resumed rather than reloaded, so check for a new
      // version on resume. A failed check (e.g. offline) is retried on the next resume.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    }).catch(err => {
      // Kept deliberately: without the worker the app still runs, just not offline
      console.warn("Service worker registration failed:", err);
    });

    // When a new version takes over, reload once so the page runs the new code:
    // straight away if the app hasn't been used yet, otherwise when it's next
    // hidden, so it never reloads mid-use
    if (navigator.serviceWorker.controller) {
      let used = false, reloaded = false;
      const reload = () => { if (!reloaded) { reloaded = true; location.reload(); } };
      ["pointerdown", "keydown"].forEach(type => document.addEventListener(type, () => { used = true; }, { once: true, capture: true }));
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!used || document.visibilityState === "hidden") return reload();
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") reload(); });
      });
    }
  });
}

// Block pinch-zoom (iOS Safari ignores user-scalable=no)
["gesturestart", "gesturechange", "gestureend"].forEach(type => document.addEventListener(type, e => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
