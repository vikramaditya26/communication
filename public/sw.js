// Vaani service worker: keeps the app and the books you open available offline.
const VERSION = "v1";
const PAGES = `vaani-pages-${VERSION}`;
const STATIC = `vaani-static-${VERSION}`;
const BOOKS = "vaani-books"; // not versioned, so downloaded books survive app updates

const SHELL = ["/", "/speak", "/sounds", "/review", "/progress", "/talk"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("vaani-") && k !== BOOKS && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (cacheName, request) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

// Pages: try the network first so you always get the latest; fall back to the saved copy offline.
const networkFirst = async (request) => {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match("/")) ||
      new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/books/") || url.pathname.startsWith("/covers/")) {
    event.respondWith(cacheFirst(BOOKS, request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(cacheFirst(STATIC, request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});
