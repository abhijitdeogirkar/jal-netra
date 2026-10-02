// JAL-NETRA Service Worker — अ‍ॅप शेल कॅश (ऑफलाइन उघडण्यासाठी)
// कोड बदलल्यावर CACHE_VERSION वाढवा → जुना कॅश आपोआप साफ होतो
const CACHE_VERSION = "jalnetra-v1";
const APP_SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./config.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/cracked-earth.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API कॉल्स (Apps Script) आणि POST कधीही कॅश करू नका
  if (e.request.method !== "GET" || url.hostname.includes("script.google.com") || url.hostname.includes("googleusercontent.com")) return;
  // CDN (bootstrap/sweetalert/fonts): network-first, fallback cache
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // स्वतःच्या फाईल्स: cache-first, background update
  e.respondWith(caches.match(e.request).then((cached) => {
    const net = fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => cached);
    return cached || net;
  }));
});
