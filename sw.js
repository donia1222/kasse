const CACHE = 'kasse-v54'
const IMG_CACHE = 'kasse-img-v1'
const STATIC = ['/caja/', '/caja/index.html', '/caja/app.js?v=49', '/caja/styles.css?v=49', '/caja/manifest.json']

// Endpoints de API que NUNCA se cachean (datos en tiempo real)
const API_ENDPOINTS = ['get_products.php', 'get_categories.php', 'save_order', 'orders']

function isApiCall(url) {
  return API_ENDPOINTS.some(ep => url.includes(ep))
}

function isImage(url) {
  return /\.(jpg|jpeg|png|webp|gif|svg|JPG|JPEG|PNG|WEBP)(\?|$)/.test(url)
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = e.request.url

  // Llamadas API de datos: nunca interceptar, siempre red directa
  if (isApiCall(url)) return

  // Imágenes del backend: cache-first con red de fallback (evita 429)
  if (url.includes('lweb.ch') && isImage(url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          }).catch(() => cached || new Response('', { status: 404 }))
        })
      )
    )
    return
  }

  // CSS y JS: siempre de la red (network-first) para ver cambios al instante
  if (url.includes('.css') || (url.includes('.js') && !url.includes('qrcode'))) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, copy))
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // Resto de estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
