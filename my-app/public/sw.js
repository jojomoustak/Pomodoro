const CACHE_NAME = "pomodoro-offline-v3";

const CORE_ASSETS = [
  "/",
  "/bell.mp3",
  "/button-click.mp3",
  "/privacy.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        CORE_ASSETS.map((asset) => cache.add(asset))
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith("pomodoro-offline-") &&
              cacheName !== CACHE_NAME
          )
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );

  self.clients.claim();
});


// ============================================================
// CACHE FILES THAT THE CURRENT NEXT.JS PAGE HAS ALREADY LOADED
// ============================================================

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") {
    return;
  }

  const urls = Array.isArray(event.data.urls)
    ? event.data.urls
    : [];

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const parsedUrl = new URL(url);

            if (parsedUrl.origin !== self.location.origin) {
              return;
            }

            if (parsedUrl.pathname.startsWith("/api/")) {
              return;
            }

            const response = await fetch(url);

            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Ignore individual cache failures.
          }
        })
      );
    })
  );
});


// ============================================================
// NETWORK REQUESTS
// ============================================================

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache our notification API.
  if (url.pathname.startsWith("/api/")) {
    return;
  }


  // ----------------------------------------------------------
  // PAGE NAVIGATION:
  // Online -> get newest page
  // Offline -> use cached page
  // ----------------------------------------------------------

  if (request.mode === "navigate") {
    event.respondWith(
      // Always revalidate the document while online. This prevents an old
      // HTML shell from referring to stale CSS/JavaScript after a deployment.
      fetch(new Request(request, { cache: "no-store" }))
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }

          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);

          if (cachedPage) {
            return cachedPage;
          }

          return caches.match("/");
        })
    );

    return;
  }


  // ----------------------------------------------------------
  // NEXT.JS STATIC FILES / CSS / JS / IMAGES / AUDIO / FONTS
  // ----------------------------------------------------------

  const shouldCache =
    url.pathname.startsWith("/_next/static/") ||
    ["script", "style", "image", "audio", "font"].includes(
      request.destination
    );

  if (!shouldCache) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    })
  );
});
