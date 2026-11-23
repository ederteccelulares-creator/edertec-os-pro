const CACHE_NAME = 'edertec-os-pro-shell-v3';
const APP_SCOPE = new URL(self.registration.scope);
const APP_PATH = APP_SCOPE.pathname.endsWith('/') ? APP_SCOPE.pathname : `${APP_SCOPE.pathname}/`;
const APP_SHELL = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icons/edertec-192.svg',
  'icons/edertec-512.svg',
  'icons/edertec-maskable.svg',
].map(path => new URL(path, APP_SCOPE).toString());

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const relativePath = url.pathname.startsWith(APP_PATH)
    ? url.pathname.slice(APP_PATH.length)
    : url.pathname.replace(/^\\//, '');
  if (/^(rest|auth|functions)(\\/|$)/.test(relativePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(new URL('index.html', APP_SCOPE).toString(), copy)));
        }
        return response;
      }).catch(async () => (
        (await caches.match(new URL('index.html', APP_SCOPE).toString())) ||
        (await caches.match(APP_SCOPE.toString()))
      ))
    );
    return;
  }

  if (url.pathname.startsWith(`${APP_PATH}assets/`)) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      }).catch(async () => await caches.match(request))
    );
  }
});
