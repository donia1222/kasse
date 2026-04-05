const CACHE = 'kasse-v46'
const STATIC = ['/caja/', '/caja/index.html', '/caja/app.js', '/caja/styles.css', '/caja/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // API calls: nunca interceptar, siempre red directa
  if (e.request.url.includes('lweb.ch/templettedhop')) return

  // Archivos estáticos: cache-first (no toca el servidor si ya está en caché)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
