const CACHE_NAME = 'sys-pwa-v6';
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/stylesheets/variables.css',
  '/stylesheets/main.css',
  '/stylesheets/components.css',
  '/stylesheets/dashboard.css',
  '/javascripts/main.js',
  '/javascripts/pwa.js',
  '/javascripts/notifications.js',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png',
  '/images/icons/maskable-icon-512x512.png',
  '/images/sys-image.png',
  '/images/Gemini_Generated_Image_41luhh41luhh41lu-removebg-preview.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // 1. Bypass all cross-origin / external requests so Service Worker does not intercept external CDNs or third-party APIs
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 2. Avoid caching API requests; always try network first with no-store
  if (url.pathname.startsWith('/api/') || (request.headers.get('accept') || '').includes('application/json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => response)
        .catch(() => caches.match('/offline.html').then(cached => cached || new Response(JSON.stringify({ error: 'Network error', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })))
    );
    return;
  }

  // 3. Network-First strategy for JS and CSS files to guarantee fresh code execution
  if (url.pathname.startsWith('/javascripts/') || url.pathname.startsWith('/stylesheets/')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request).then(cached => cached || new Response('', { status: 408, statusText: 'Resource Unavailable' })))
    );
    return;
  }

  // 4. Network-First strategy for HTML navigation requests
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/offline.html')).then(res => res || new Response('<h1>Offline</h1><p>Please check your internet connection.</p>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })))
    );
    return;
  }

  // 5. Cache-First fallback for static media/assets
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          if (request.destination === 'image') {
            return caches.match('/images/sys-image.png').then(img => img || new Response('', { status: 404 }));
          }
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
    })
  );
});
