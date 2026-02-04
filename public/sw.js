self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first without caching. Keeping it simple for now.
  event.respondWith(fetch(event.request).catch(() => new Response("")));
});
