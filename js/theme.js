// Apply the saved theme before the page paints, so dark mode never flashes white.
// Loaded in <head>, ahead of main.js, which owns the theme from then on.
// The key must match STORAGE_KEYS.settings in main.js.
(() => {
  let pref = "light";
  try {
    pref = (JSON.parse(localStorage.getItem("race-nutrition-settings-v1")) || {}).theme || "light";
  } catch {
    // Storage unavailable or unreadable: fall back to light, as main.js does
  }
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
