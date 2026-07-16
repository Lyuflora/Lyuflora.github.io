const cacheName = "vfx-asset-recolor-shell-20260714-privacy";
const csp = "default-src 'none'; base-uri 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self'; manifest-src 'none'; form-action 'none'; prefetch-src 'none'";
const scopeUrl = new URL(self.registration.scope);

const allowedUrls = new Set([
  new URL("./", scopeUrl).href,
  new URL("./index.html", scopeUrl).href,
  new URL("./styles.css?v=20260711-title", scopeUrl).href,
  new URL("./app.js?v=20260714-privacy", scopeUrl).href,
  new URL("./service-worker.js", scopeUrl).href
]);

const shellUrls = [
  new URL("./", scopeUrl).href,
  new URL("./index.html", scopeUrl).href,
  new URL("./styles.css?v=20260711-title", scopeUrl).href,
  new URL("./app.js?v=20260714-privacy", scopeUrl).href
];

function isAllowedRequest(request) {
  if (request.method !== "GET") return false;
  return allowedUrls.has(request.url);
}

function withPrivacyHeaders(response, request) {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.mode === "navigate" || request.destination === "document") {
    headers.set("Content-Security-Policy", csp);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(cacheName)
      .then(cache => cache.addAll(shellUrls))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith("vfx-asset-recolor-shell-") && name !== cacheName)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (!isAllowedRequest(event.request)) {
    event.respondWith(Response.error());
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(cacheName).then(cache => cache.put(event.request, copy));
        return response;
      }))
      .then(response => withPrivacyHeaders(response, event.request))
  );
});
