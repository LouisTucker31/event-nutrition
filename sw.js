// Offline support: pre-cache the app shell, then fetch network-first so the
// installed app always picks up the latest version, falling back to the cache
// when offline or on a slow connection. Bump VERSION to force a clean re-cache.
//
// This file stays in the site root (not js/) because a service worker can only
// control pages at or below its own folder.
//
// Every app on louistucker31.github.io shares one set of caches, so this app's
// cache names start with its own prefix, and "activate" only deletes caches
// with that prefix (never another app's).
const PREFIX = "race-nutrition-";
const VERSION = "v13";
const CACHE = PREFIX + VERSION;
const NETWORK_TIMEOUT = 3000;
const ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/theme.js",
  "js/main.js",
  "js/liquid-glass-nav.js",
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache so we store fresh copies
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // no-cache: revalidate with the server instead of trusting GitHub Pages' 10-minute max-age
    const network = fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    const fallback = () => cache.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === "navigate" ? cache.match("index.html") : undefined));
    // Keep the worker alive until the background refresh finishes. Its failure is
    // already handled below (cache fallback), so it is not rethrown here.
    e.waitUntil(network.catch(() => {}));
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT));
      return await Promise.race([network, timeout]);
    } catch {
      return (await fallback()) || network.catch(() => Response.error());
    }
  })());
});
