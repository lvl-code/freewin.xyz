const CACHE_NAME =
  `platform-${self.location.hostname}-v2`;

const STATIC_ASSETS = [
  "/",
  "/en",
  "/static/css/main.css",
  "/static/css/responsive.css",
  "/static/css/casino.css",
  "/static/css/dashboard.css"
];

// ----------------------------------------------------------
// INSTALL
// ----------------------------------------------------------

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(
            STATIC_ASSETS
          )
        )
    );

    self.skipWaiting();
  }
);

// ----------------------------------------------------------
// ACTIVATE
// ----------------------------------------------------------

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(

      caches.keys()
        .then(keys =>

          Promise.all(

            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(
                key =>
                  caches.delete(key)
              )
          )
        )
    );

    self.clients.claim();
  }
);

// ----------------------------------------------------------
// FETCH
// ----------------------------------------------------------

self.addEventListener(
  "fetch",
  event => {

    if (
      event.request.method !==
      "GET"
    ) {
      return;
    }

    const request =
      event.request;

    const url =
      new URL(request.url);

    // ------------------------------------------------------
    // Never cache dynamic tenant branding/PWA endpoints.
    // ------------------------------------------------------

    if (
      url.pathname ===
        "/site.webmanifest" ||

      url.pathname.startsWith(
        "/api/"
      )
    ) {
      event.respondWith(
        fetch(request)
      );

      return;
    }

    // ------------------------------------------------------
    // Network-first for HTML navigation.
    // ------------------------------------------------------

    if (
      request.mode ===
        "navigate"
    ) {

      event.respondWith(

        fetch(request)
          .then(response => {

            if (
              response &&
              response.status === 200
            ) {

              const clone =
                response.clone();

              caches.open(
                CACHE_NAME
              ).then(cache => {

                cache.put(
                  request,
                  clone
                );

              });
            }

            return response;
          })

          .catch(() =>
            caches.match(
              request
            ).then(cached =>
              cached ||
              caches.match("/")
            )
          )
      );

      return;
    }

    // ------------------------------------------------------
    // Cache-first for static resources.
    // ------------------------------------------------------

    if (
      url.pathname.startsWith(
        "/static/"
      )
    ) {

      event.respondWith(

        caches.match(request)
          .then(cached => {

            if (cached) {
              return cached;
            }

            return fetch(request)
              .then(response => {

                if (
                  response.status ===
                    200 &&
                  response.type ===
                    "basic"
                ) {

                  const clone =
                    response.clone();

                  caches.open(
                    CACHE_NAME
                  ).then(cache =>
                    cache.put(
                      request,
                      clone
                    )
                  );
                }

                return response;
              });
          })
      );

      return;
    }

    // ------------------------------------------------------
    // Default: network first.
    // ------------------------------------------------------

    event.respondWith(
      fetch(request)
        .catch(() =>
          caches.match(request)
        )
    );
  }
);
