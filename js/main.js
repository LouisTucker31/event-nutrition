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
const VIEWS = ["page1", "page2", "page3"];
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
const savedView = storage.read(STORAGE_KEYS.view, VIEWS[0]);
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
// places (default 2; 0 allows whole numbers only).
function formatNumber(raw, decimals = 2) {
  let digits = raw.replace(/[^\d.]/g, "");
  if (decimals === 0) digits = digits.replace(/\./g, "");
  const dot = digits.indexOf(".");
  if (dot !== -1) digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, "");
  let [whole, fraction] = digits.split(".");
  whole = whole.replace(/^0+(?=\d)/, "").slice(0, 7).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? whole : `${whole || "0"}.${fraction.slice(0, decimals)}`;
}
const decimalsFor = input => Number(input.dataset.decimals ?? 2);
// A box's text as a number, or null when it's empty
function parseNumber(text) {
  const value = parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
// A stored number as box text, rounded to the box's decimal places (1.50 -> "1.5")
const displayNumber = (value, decimals) => formatNumber(String(Number(value.toFixed(decimals))), decimals);

function formatAsYouType(input) {
  input.addEventListener("input", () => {
    const before = input.value;
    const after = formatNumber(before, decimalsFor(input));
    if (after === before) return;
    // Keep the caret after the same digit it was after
    const caret = input.selectionStart ?? before.length;
    const keptLeftOfCaret = before.slice(0, caret).replace(/[^\d.]/g, "").length;
    input.value = after;
    let pos = 0, seen = 0;
    while (pos < after.length && seen < keptLeftOfCaret) { if (/[\d.]/.test(after[pos])) seen++; pos++; }
    input.setSelectionRange(pos, pos);
  }, { capture: true }); // before the save handlers, so the formatted value is what's saved
}
document.querySelectorAll("#settingsDialog [data-format]").forEach(formatAsYouType);

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

// Show a stored value in its box, in the current units
function fillNumberBox(input, value) {
  const kind = input.dataset.convert;
  if (kind) input.dataset.decimals = unitFor(kind).decimals;
  input.value = value == null ? "" : displayNumber(kind ? toDisplay(kind, value) : value, decimalsFor(input));
}
// A box's value to store: a metric number, or undefined when empty
function readNumberBox(input) {
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
}));

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
useTestResult.addEventListener("click", () => {
  fields.sweatRate = testRate;
  saveSettings();
  fillNumberBox(document.querySelector('[data-key="sweatRate"]'), fields.sweatRate);
});

// Saltiness band: from a lab result if there is one, otherwise from how many of
// the six salty-sweater signs are ticked (0-1 low, 2-3 average, 4-6 high).
// Bands are sweat sodium in mg per litre.
const SALT_BANDS = [
  { name: "Low", range: "under 700 mg/L", below: 700, minSigns: 0 },
  { name: "Average", range: "700–1,200 mg/L", below: 1200, minSigns: 2 },
  { name: "High", range: "over 1,200 mg/L", below: Infinity, minSigns: 4 }
];
const saltSignInputs = [...document.querySelectorAll("[data-salty-sign]")];
const saltBand = document.getElementById("saltBand");
function updateSaltBand() {
  const signs = fields.saltySigns || [];
  if (fields.sweatSodium != null) {
    const band = SALT_BANDS.find(b => fields.sweatSodium < b.below);
    saltBand.textContent = `${band.name} (${displayNumber(fields.sweatSodium, 0)} mg/L, from your lab test)`;
  } else {
    const band = SALT_BANDS.findLast(b => signs.length >= b.minSigns);
    saltBand.textContent = `${band.name} (${band.range})`;
  }
  saltBand.classList.toggle("is-set", fields.sweatSodium != null || signs.length > 0);
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
  if (product.volume != null && ["drink", "tab"].includes(product.type)) parts.push(`in ${formatWithUnit("volume", product.volume)}`);
  return parts.join(" · ");
}
// Cards start folded; one is open at a time, as in Race Ready's checklists.
// A new product opens so it can be filled in.
let openProductId = null;
let productToRemove = null;

function renderProducts() {
  productList.textContent = "";
  productsEmpty.hidden = settings.products.length > 0;
  settings.products.forEach(product => {
    const card = productTemplate.content.firstElementChild.cloneNode(true);
    const toggle = card.querySelector(".disclosure__toggle");
    const body = card.querySelector(".disclosure__body");
    body.id = `product-${product.id}`;
    toggle.setAttribute("aria-controls", body.id);
    const setOpen = open => {
      card.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    setOpen(product.id === openProductId);
    toggle.addEventListener("click", () => {
      const open = !card.classList.contains("is-open");
      productList.querySelectorAll(".product.is-open").forEach(other => {
        other.classList.remove("is-open");
        other.querySelector(".disclosure__toggle").setAttribute("aria-expanded", "false");
      });
      setOpen(open);
      openProductId = open ? product.id : null;
    });

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
      productToRemove = product;
      document.getElementById("removeProductTitle").textContent = `Remove ${productTitle(product)}?`;
      removeProductDialog.showModal();
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
const removeProductDialog = document.getElementById("removeProductDialog");
document.getElementById("removeProductCancel").addEventListener("click", () => removeProductDialog.close());
removeProductDialog.addEventListener("click", e => { if (e.target === removeProductDialog) removeProductDialog.close(); }); // tap outside
document.getElementById("removeProductConfirm").addEventListener("click", () => {
  removeProductDialog.close();
  if (productToRemove) removeProduct(productToRemove);
  productToRemove = null;
});

// Fill every box from storage, in the current units (on load, after a units
// change and after clearing)
function renderSettings() {
  fieldInputs.forEach(input => {
    if (input.dataset.format) fillNumberBox(input, fields[input.dataset.key]);
    else input.value = fields[input.dataset.key] ?? "";
  });
  fillHeight();
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
}));
renderSettings();

// Clear my details: everything on the settings page except units and theme
const resetDialog = document.getElementById("resetDialog");
document.getElementById("resetApp").addEventListener("click", () => resetDialog.showModal());
document.getElementById("resetCancel").addEventListener("click", () => resetDialog.close());
resetDialog.addEventListener("click", e => { if (e.target === resetDialog) resetDialog.close(); }); // tap outside
document.getElementById("resetConfirm").addEventListener("click", () => {
  Object.keys(fields).forEach(key => delete fields[key]);
  settings.products = [];
  openProductId = null;
  saveSettings();
  renderSettings();
  resetDialog.close();
});

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
