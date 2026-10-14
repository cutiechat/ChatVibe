
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          "<h2>CutieChat</h2><p>Internet connection check chesi malli try cheyyi.</p>",
          {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          }
        )
      )
    );
  }
});
