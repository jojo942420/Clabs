const SHELL_CACHE = 'clabs-shell-2026-10-design-v10';
const PUBLIC_ASSETS=/*__PUBLIC_ASSETS__*/;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    const response = await fetch('/', { cache: 'reload' });
    if (response.ok) await cache.put('/', response);
    await Promise.all(PUBLIC_ASSETS.map(async url=>{try{const image=await fetch(url);if(image.ok)await cache.put(url,image)}catch{}}));
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
  if(event.request.method==='GET'&&url.origin===self.location.origin&&PUBLIC_ASSETS.includes(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(SHELL_CACHE),cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response})());return}
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
