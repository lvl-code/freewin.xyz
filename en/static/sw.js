const CACHE_NAME = `platform-${self.location.hostname}-v1`;

const STATIC_ASSETS = [
  "/",
  "/en",
  "/static/css/main.css",
  "/static/css/responsive.css",
  "/static/css/casino.css",
  "/static/css/dashboard.css",
  "/static/js/main.js",
  "/static/icon/favicon.ico",
  "/static/icon/apple-touch-icon.png",
  "/static/icon/site.webmanifest",
  "/static/images/logo.png"
];

// Install
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", event => {

  if (event.request.method !== "GET") return;

  event.respondWith(

    caches.match(event.request)
      .then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(event.request)
          .then(response => {

            if (
              response.status === 200 &&
              response.type === "basic"
            ) {

              const clone = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));

            }

            return response;

          })
          .catch(() => {

            return caches.match("/en");

          });

      })

  );

});
