const SHELL_CACHE = 'knox-shell-2026-10-attendance-v7';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    const response = await fetch('/', { cache: 'reload' });
    if (response.ok) await cache.put('/', response);
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('knox-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put('/', response.clone()).catch(()=>{});
      }
      return response;
    } catch (error) {
      const cached = await caches.match('/');
      if (cached) return cached;
      throw error;
    }
  })());
});
