self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function prefixPath(){
  const scopePath = new URL(self.registration.scope).pathname; // e.g. "/user/repo/"
  return (scopePath.endsWith('/') ? scopePath : scopePath + '/') + '__reveal/';
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const PREFIX = prefixPath();

  if (url.pathname.startsWith(PREFIX)) {
    event.respondWith(
      caches.match(event.request).then(r => r || new Response('Not found', { status: 404 }))
    );
  }
});
