const API = 'https://web.lweb.ch/templettedhop/'
let products = [], categories = [], cart = [], activeCat = null, payMethod = 'cash'
let bonNo = parseInt(localStorage.getItem('kasse_bon') || '1042')
let soundEnabled = localStorage.getItem('kasse_sound') !== 'off'
let darkMode = localStorage.getItem('kasse_dark') === 'on'
let cartDiscount = 0   // porcentaje 0-100
let cashPadVal = ''    // valor del numpad de efectivo
let saleNote = ''      // nota libre en la venta
let favorites = new Set(JSON.parse(localStorage.getItem('kasse_favs') || '[]'))
let manualEditId = null  // null = nuevo ítem manual, id = editar precio en carrito

// Imágenes locales por categoría (keyword → archivo en /images/)
const CAT_LOCAL_IMAGES = {
  'grill':       'images/grill.jpeg',
  'rauch':       'images/grill.jpeg',
  'lampen':      'images/lampen.jpg',
  'licht':       'images/lampen.jpg',
  'armbrust zubeh': 'images/armbrustzubehort.jpg',
  'armbrustzubeh':  'images/armbrustzubehort.jpg',
  'armbrust':    'images/armburust.jpg',
  'beil':        'images/beil.jpg',
  'axt':         'images/beil.jpg',
  'messer':      'images/messer.jpg',
  'klinge':      'images/messer.jpg',
  'bogen':       'images/pleiegebogen.jpg',
  'pfeil':       'images/pleiegebogen.jpg',
  'schleuder':   'images/scheuler.jpg',
  'sicherheit':  'images/security.jpg',
  'security':    'images/security.jpg',
  'schutz':      'images/security.jpg',
}

// Emojis por categoría (keyword matching)
const fi = n => `<i class="fa-solid ${n}"></i>`
const CAT_EMOJIS = {
  fisch: fi('fa-fish'), angel: fi('fa-fish'), köder: fi('fa-fish'), rute: fi('fa-fish'),
  jagd: fi('fa-crosshairs'), waffe: fi('fa-crosshairs'), gewehr: fi('fa-crosshairs'), pistole: fi('fa-crosshairs'),
  munition: fi('fa-bullseye'),
  bekleidung: fi('fa-shirt'), stiefel: fi('fa-socks'),
  zubehör: fi('fa-wrench'), wartung: fi('fa-wrench'),
  messer: fi('fa-utensils'), klinge: fi('fa-utensils'), taschenmesser: fi('fa-utensils'),
  optik: fi('fa-binoculars'), fernglas: fi('fa-binoculars'), zielfernrohr: fi('fa-binoculars'),
  tarnung: fi('fa-user-secret'),
  falle: fi('fa-triangle-exclamation'),
  boot: fi('fa-anchor'),
  electronics: fi('fa-satellite-dish'), elektronik: fi('fa-satellite-dish'),
  food: fi('fa-drumstick-bite'), nahrung: fi('fa-drumstick-bite'),
  camping: fi('fa-campground'), zelt: fi('fa-campground'),
  outdoor: fi('fa-mountain'),
  sale: fi('fa-tag'), neu: fi('fa-star'),
  lampe: fi('fa-lightbulb'), licht: fi('fa-lightbulb'), taschenlampe: fi('fa-lightbulb'),
  armbrust: fi('fa-bullseye'), bogen: fi('fa-bullseye'), pfeil: fi('fa-bullseye'),
  beil: fi('fa-hammer'), axt: fi('fa-hammer'), hatchet: fi('fa-hammer'),
  schleuder: fi('fa-circle-dot'),
  sicherheit: fi('fa-shield-halved'), schutz: fi('fa-shield-halved'), holster: fi('fa-shield-halved'),
  handschuh: fi('fa-hand'),
  rucksack: fi('fa-bag-shopping'), tasche: fi('fa-bag-shopping'),
  schlafsack: fi('fa-bed'),
  pflege: fi('fa-spray-can'),
}

const FALLBACK_ICONS = ['fa-crosshairs','fa-campground','fa-lightbulb','fa-hammer','fa-bullseye','fa-scissors','fa-shield-halved','fa-circle-dot','fa-binoculars','fa-hand','fa-bag-shopping','fa-fish','fa-mountain','fa-satellite-dish','fa-tag','fa-wrench']

function getCatEmoji(name, idx) {
  const lower = (name || '').toLowerCase()
  for (const [key, icon] of Object.entries(CAT_EMOJIS)) {
    if (lower.includes(key)) return icon
  }
  return fi(FALLBACK_ICONS[idx % FALLBACK_ICONS.length])
}

function getCatLocalImage(name) {
  const lower = (name || '').toLowerCase()
  for (const [key, path] of Object.entries(CAT_LOCAL_IMAGES)) {
    if (lower.includes(key)) return path
  }
  return null
}


// ── Image helpers ──────────────────────────────────────────────────────────────
// Si una URL no tiene extensión, probamos las variantes más comunes (igual que hot-sauce ProductImage)
const IMG_EXTS = ['.jpg', '.JPG', '.jpeg', '.JPEG', '.png', '.webp']
const HAS_IMG_EXT = /\.(jpg|jpeg|png|gif|webp|svg|JPG|JPEG|PNG)$/i

function expandUrl(url) {
  if (!url) return []
  return HAS_IMG_EXT.test(url) ? [url] : IMG_EXTS.map(ext => url + ext)
}

// Caché en memoria: recuerda qué URL concreta funcionó para no reintentar extensiones fallidas
const resolvedImgCache = {}

function getImages(p) {
  const cached = resolvedImgCache[p.id]
  if (cached) return [cached]

  const fromUrls = Array.isArray(p.image_urls) ? p.image_urls.filter(Boolean) : []
  const fromCandidates = Array.isArray(p.image_url_candidates) ? p.image_url_candidates.filter(Boolean) : []
  const raw = [...fromUrls]
  if (p.image_url) raw.push(p.image_url)
  raw.push(...fromCandidates)
  const expanded = []
  for (const u of [...new Set(raw)]) expanded.push(...expandUrl(u))
  return [...new Set(expanded)]
}

function firstImage(p) { return getImages(p)[0] || '' }

// ── Load data ──────────────────────────────────────────────────────────────────
const CACHE_TTL     = 60 * 60 * 1000  // 1 hora — fresco
const CACHE_TTL_MAX = 24 * 60 * 60 * 1000 // 24 h — caché vieja usable como fallback

function fromLocalCache(key, allowStale = false) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    const age = Date.now() - ts
    if (age > (allowStale ? CACHE_TTL_MAX : CACHE_TTL)) return null
    return data
  } catch { return null }
}

function toLocalCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

function cacheIsFresh(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    return Date.now() - JSON.parse(raw).ts < CACHE_TTL
  } catch { return false }
}

async function load() {
  // Usar caché fresca si existe
  const cachedP = fromLocalCache('products')
  const cachedC = fromLocalCache('categories')

  if (cachedP && cachedC) {
    products = cachedP
    categories = cachedC
  } else {
    // Respetar rate-limit: no reintentar durante 10 minutos tras un 429
    const rateLimitTs = parseInt(localStorage.getItem('api_rate_limit') || '0')
    if (Date.now() - rateLimitTs < 10 * 60 * 1000) {
      const staleP = fromLocalCache('products', true)
      const staleC = fromLocalCache('categories', true)
      if (staleP) products = staleP
      if (staleC) categories = staleC
      showFlash('API-Limit — bitte warten', 'warn')
    } else {
    // Intentar API; si falla usar caché vieja (stale) como fallback
    try {
      const [rp, rc] = await Promise.all([
        fetch(API + 'get_products.php'),
        fetch(API + 'get_categories.php', { method: 'POST' })
      ])

      if (rp.status === 429 || rc.status === 429) {
        console.warn('429 — usando caché antigua si existe')
        // Guardar timestamp para no reintentar por 10 minutos
        localStorage.setItem('api_rate_limit', Date.now())
        const staleP = fromLocalCache('products', true)
        const staleC = fromLocalCache('categories', true)
        if (staleP) products = staleP
        if (staleC) categories = staleC
        showFlash('API-Limit erreicht — Daten aus Cache', 'warn')
      } else {
        const [pr, cr] = await Promise.all([rp.json(), rc.json()])
        if (pr.success) { products = pr.products || []; toLocalCache('products', products) }
        if (cr.success) { categories = (cr.categories || []).filter(c => c.parent_id === null); toLocalCache('categories', categories) }
      }
    } catch (e) {
      console.error('API error:', e)
      const staleP = fromLocalCache('products', true)
      const staleC = fromLocalCache('categories', true)
      if (staleP) products = staleP
      if (staleC) categories = staleC
      if (staleP || staleC) showFlash('Offline — Daten aus Cache', 'warn')
    }
    } // end else (no rate-limit)
  }

  document.getElementById('loading').style.display = 'none'
  renderCategories()
  checkPin()
}

// ── Categories ────────────────────────────────────────────────────────────────
// ── Manual entry ─────────────────────────────────────────────────────────────
let padValue = ''

function openManual(editId = null) {
  manualEditId = editId
  if (editId !== null) {
    const item = cart.find(i => String(i.id) === String(editId))
    padValue = item ? item.price.toFixed(2) : ''
    document.getElementById('manual-desc').value = item?.name || ''
    document.getElementById('manual-desc').disabled = true
    document.getElementById('manual-add').innerHTML = '<i class="fa-solid fa-check"></i> Preis übernehmen'
    document.getElementById('manual-amount-display').textContent = item ? item.price.toFixed(2) : '0.00'
  } else {
    padValue = ''
    document.getElementById('manual-desc').value = ''
    document.getElementById('manual-desc').disabled = false
    document.getElementById('manual-add').innerHTML = '<i class="fa-solid fa-plus"></i> Hinzufügen'
    document.getElementById('manual-amount-display').textContent = '0.00'
  }
  document.getElementById('manual-overlay').classList.add('visible')
}

function closeManual() {
  document.getElementById('manual-overlay').classList.remove('visible')
  document.getElementById('manual-desc').disabled = false
  document.getElementById('manual-add').innerHTML = '<i class="fa-solid fa-plus"></i> Hinzufügen'
  manualEditId = null
}

function padPress(k) {
  if (k === '⌫') { padValue = padValue.slice(0, -1); }
  else if (k === '.' && padValue.includes('.')) return
  else if (padValue.length >= 8) return
  else padValue += k
  const num = parseFloat(padValue) || 0
  document.getElementById('manual-amount-display').textContent = num.toFixed(padValue.includes('.') ? Math.min(2, (padValue.split('.')[1]||'').length) : 2)
}

function addManual() {
  const price = parseFloat(padValue) || 0
  if (price <= 0) return
  if (manualEditId !== null) {
    // Editar precio de ítem existente en carrito
    const item = cart.find(i => String(i.id) === String(manualEditId))
    if (item) item.price = price
  } else {
    const desc = document.getElementById('manual-desc').value.trim() || 'Manuell'
    const id = 'manual_' + Date.now()
    cart.push({ id, name: desc, price, img: '', stock: 99, qty: 1 })
  }
  beep()
  renderCart(); updateTotal()
  closeManual()
}

function saveFavorites() {
  localStorage.setItem('kasse_favs', JSON.stringify([...favorites]))
}

function toggleFavorite(id, e) {
  e && e.stopPropagation()
  if (favorites.has(id)) favorites.delete(id)
  else favorites.add(id)
  saveFavorites()
  // Actualizar botón estrella visible sin re-render completo
  document.querySelectorAll(`.fav-btn[data-pid="${id}"]`).forEach(btn => {
    btn.classList.toggle('active', favorites.has(id))
    btn.querySelector('i').className = favorites.has(id) ? 'fa-solid fa-star' : 'fa-regular fa-star'
  })
  // Refrescar vista de favoritos si está activa
  if (activeCat === '__favs__') {
    delete catDomCache['__favs__']
    toggleCat('__favs__')
  }
  // Refrescar tile de favoritos en el grid
  renderCategories()
}

function renderCategories() {
  const tabs = document.getElementById('cat-tabs')
  tabs.innerHTML = ''

  // Tile Favoritos (solo si hay alguno marcado)
  if (favorites.size > 0) {
    const favCount = products.filter(p => favorites.has(p.id)).length
    const favBtn = document.createElement('button')
    favBtn.className = 'cat-banner cat-banner-favs'
    favBtn.innerHTML = `
      <div class="cat-banner-bg">
        <div class="cat-banner-icon-wrap"><i class="fa-solid fa-star"></i></div>
      </div>
      <div class="cat-banner-overlay">
        <span class="cb-name">Favoriten</span>
        <span class="cb-count">${favCount}</span>
      </div>`
    favBtn.onclick = () => toggleCat('__favs__')
    tabs.appendChild(favBtn)
  }

  categories.forEach((cat, idx) => {
    const count = products.filter(p => p.category === cat.slug || p.category === cat.name).length
    const cleanName = cat.name.replace(/\s*\d{4}$/, '')
    const emoji = getCatEmoji(cleanName, idx)
    const btn = document.createElement('button')
    btn.className = 'cat-banner'
    btn.dataset.slug = cat.slug
    const localImg = getCatLocalImage(cleanName)
    const bgHtml = localImg
      ? `<img src="${localImg}" alt="${cleanName}" class="cat-banner-img">`
      : `<div class="cat-banner-icon-wrap">${emoji}</div>`
    btn.innerHTML = `
      <div class="cat-banner-bg">${bgHtml}</div>
      <div class="cat-banner-overlay">
        <span class="cb-name">${cleanName}</span>
        <span class="cb-count">${count}</span>
      </div>`
    btn.onclick = () => toggleCat(cat.slug)
    tabs.appendChild(btn)
  })
  // Banner manual al final
  const manBtn = document.createElement('button')
  manBtn.className = 'cat-banner cat-banner-manual'
  manBtn.innerHTML = `
    <div class="cat-banner-bg"><div class="cat-banner-icon-wrap"><i class="fa-solid fa-calculator"></i></div></div>
    <div class="cat-banner-overlay">
      <span class="cb-name">Manuell</span>
      <span class="cb-count">+</span>
    </div>`
  manBtn.onclick = openManual
  tabs.appendChild(manBtn)

}

const catDomCache = {}

function buildProdCard(p) {
  const imgs = getImages(p)
  const imgTag = imgs.length > 0
    ? `<img src="${imgs[0]}" data-pid="${p.id}" data-imgs='${JSON.stringify(imgs).replace(/'/g, "&#39;")}' data-idx="0" loading="lazy" onload="prodImgLoad(this)" onerror="prodImgError(this)" alt="${p.name}">`
    : `<div class="prod-no-img"><i class="fa-solid fa-box-open"></i></div>`
  const isFav = favorites.has(p.id)
  const stockOk = (p.stock || 0) > 0
  const lowStock = stockOk && (p.stock || 0) <= 3
  return `
  <div class="prod-card ${stockOk ? '' : 'out'}">
    <button class="prod-btn" onclick="addToCart(${p.id})">
      <div class="prod-img-wrap">${imgTag}</div>
      <div class="prod-info-wrap">
        <div class="pname">${p.name}</div>
        <div class="pinfo">CHF ${parseFloat(p.price).toFixed(2)}</div>
        <div class="pstock ${lowStock ? 'low' : ''}">${stockOk ? `${p.stock} Stk${lowStock ? ' ⚠' : ''}` : 'Ausverkauft'}</div>
      </div>
    </button>
    <button class="fav-btn ${isFav ? 'active' : ''}" data-pid="${p.id}" onclick="toggleFavorite(${p.id}, event)" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
      <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-star"></i>
    </button>
  </div>`
}

function buildCatNode(slug) {
  const prods = slug === '__favs__'
    ? products.filter(p => favorites.has(p.id))
    : (() => { const cat = categories.find(c => c.slug === slug); return products.filter(p => p.category === slug || (cat && p.category === cat.name)) })()
  const grid = document.createElement('div')
  grid.className = 'prod-grid'
  grid.innerHTML = prods.length > 0
    ? prods.map(p => buildProdCard(p)).join('')
    : '<p style="padding:20px;color:var(--text3);font-size:14px;grid-column:1/-1">Keine Favoriten gespeichert</p>'
  return grid
}

function toggleCat(slug) {
  const el = document.getElementById('cat-products')
  const tabs = document.getElementById('cat-tabs')
  const header = document.getElementById('cat-header')
  const headerName = document.getElementById('cat-header-name')

  // Ocultar categoría activa anterior
  if (activeCat && catDomCache[activeCat]) {
    catDomCache[activeCat].style.display = 'none'
  }

  activeCat = slug
  const cat = categories.find(c => c.slug === slug)
  const cleanName = slug === '__favs__' ? 'Favoriten' : (cat ? cat.name.replace(/\s*\d{4}$/, '') : slug)

  // Ocultar grid de categorías, mostrar header con nombre + botón volver
  tabs.style.display = 'none'
  headerName.textContent = cleanName
  header.style.display = 'flex'

  // Crear nodo DOM la primera vez, luego solo mostrar
  if (!catDomCache[slug]) {
    catDomCache[slug] = buildCatNode(slug)
    el.appendChild(catDomCache[slug])
  } else {
    catDomCache[slug].style.display = 'grid'
  }
  el.classList.add('visible')
}

function backToCats() {
  const el = document.getElementById('cat-products')
  const tabs = document.getElementById('cat-tabs')
  const header = document.getElementById('cat-header')

  if (activeCat && catDomCache[activeCat]) {
    catDomCache[activeCat].style.display = 'none'
  }
  activeCat = null
  el.classList.remove('visible')
  header.style.display = 'none'
  tabs.style.display = ''
  const cf = document.getElementById('cat-filter')
  if (cf) cf.value = ''
}

function filterCatProducts(q) {
  if (!activeCat || !catDomCache[activeCat]) return
  const grid = catDomCache[activeCat]
  const lower = q.toLowerCase().trim()
  grid.querySelectorAll('.prod-btn').forEach(btn => {
    const name = (btn.querySelector('.pname')?.textContent || '').toLowerCase()
    btn.style.display = (!lower || name.includes(lower)) ? '' : 'none'
  })
}

function prodImgLoad(img) {
  const pid = img.dataset.pid
  if (pid && img.src) resolvedImgCache[pid] = img.src
}

function prodImgError(img) {
  const srcs = JSON.parse(img.dataset.imgs || '[]')
  const idx = parseInt(img.dataset.idx || '0') + 1
  img.dataset.idx = idx
  if (idx < srcs.length) { img.src = srcs[idx] }
  else { img.replaceWith(Object.assign(document.createElement('div'), { className: 'prod-no-img', textContent: '📦' })) }
}

// ── Beep ──────────────────────────────────────────────────────────────────────
// AudioContext compartido — se crea una vez en el primer gesto del usuario
// Evita el delay de inicialización en iOS/iPad que causaba beeps tardíos
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (_audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}

function _tone(ctx, freq, start, dur, vol = 0.3) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain); gain.connect(ctx.destination)
  osc.type = 'sine'; osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.start(start); osc.stop(start + dur)
}

function beep() {
  if (!soundEnabled) return
  try { const ctx = getAudioCtx(); _tone(ctx, 1200, ctx.currentTime, 0.12) } catch {}
}

function beepPay() {
  if (!soundEnabled) return
  try {
    const ctx = getAudioCtx(); const t = ctx.currentTime
    _tone(ctx, 880,  t,        0.10, 0.25)
    _tone(ctx, 1100, t + 0.12, 0.10, 0.25)
    _tone(ctx, 1320, t + 0.24, 0.13, 0.30)
  } catch {}
}

function beepConfirm() {
  if (!soundEnabled) return
  try {
    const ctx = getAudioCtx(); const t = ctx.currentTime
    _tone(ctx, 880,  t,        0.10, 0.20)
    _tone(ctx, 1100, t + 0.11, 0.10, 0.20)
    _tone(ctx, 1320, t + 0.22, 0.10, 0.20)
    _tone(ctx, 1760, t + 0.33, 0.18, 0.35)
  } catch {}
}

function toggleSound() {
  soundEnabled = !soundEnabled
  localStorage.setItem('kasse_sound', soundEnabled ? 'on' : 'off')
  renderTaAdmin()
}

// ── Cart ──────────────────────────────────────────────────────────────────────
function addToCart(id) {
  const p = products.find(x => x.id == id)
  if (!p || (p.stock || 0) === 0) return
  const ex = cart.find(i => i.id == id)
  if (ex) { if (ex.qty >= (p.stock || 99)) return; ex.qty++ }
  else cart.push({ id: p.id, name: p.name, price: parseFloat(p.price), img: firstImage(p), stock: p.stock || 99, qty: 1 })
  beep()
  renderCart(); updateTotal()
  if (!('ontouchstart' in window)) document.getElementById('barcode').focus()
}

function showFlash(msg, type = 'ok') {
  let toast = document.getElementById('app-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'app-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.className = type
  toast.style.display = 'block'
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { toast.style.display = 'none' }, 3500)
}

function addByBarcode(code) {
  const p = products.find(x => x.barcode === code || String(x.id) === code || (x.sku && x.sku === code))
  const box = document.getElementById('scanner-box')
  const flash = document.getElementById('flash-msg')
  if (!p || (p.stock || 0) === 0) {
    box.classList.add('err')
    flash.className = 'err'; flash.innerHTML = '⚠ Nicht gefunden'; flash.style.display = 'flex'
    setTimeout(() => { box.classList.remove('err'); flash.style.display = 'none' }, 1800)
    return
  }
  addToCart(p.id)
  box.classList.add('ok')
  flash.className = 'ok'; flash.innerHTML = '✓ Hinzugefügt'; flash.style.display = 'flex'
  setTimeout(() => { box.classList.remove('ok'); flash.style.display = 'none' }, 1000)
}

function updateQty(id, d) {
  const item = cart.find(i => String(i.id) === String(id))
  if (!item) return
  item.qty = Math.max(0, Math.min(item.qty + d, item.stock))
  if (item.qty === 0) cart = cart.filter(i => String(i.id) !== String(id))
  renderCart(); updateTotal()
}

function clearCart() {
  if (cart.length === 0) return
  if (!confirm('Warenkorb leeren?')) return
  cart = []; cartDiscount = 0; renderCart(); updateTotal(); renderDiscountBtns()
}

function renderCart() {
  const el = document.getElementById('cart-items')
  const badge = document.getElementById('cart-badge')
  const count = cart.reduce((s, i) => s + i.qty, 0)
  badge.textContent = count
  badge.classList.toggle('visible', count > 0)
  document.getElementById('clear-btn').style.visibility = cart.length > 0 ? 'visible' : 'hidden'
  if (cart.length === 0) {
    el.innerHTML = '<div id="cart-empty"><div class="icon"><i class="fa-solid fa-cart-shopping"></i></div><p>Keine Artikel</p></div>'
    return
  }
  el.innerHTML = cart.map(item => {
    const imgHtml = item.img
      ? `<img src="${item.img}" onerror="this.style.display='none'" alt="${item.name}">`
      : `<div class="cart-img-fallback">📦</div>`
    return `
    <div class="cart-item">
      <div class="cart-item-top">
        ${imgHtml}
        <div class="cname">
          <p>${item.name}</p>
          <p class="cart-price-row">
            <span>CHF ${item.price.toFixed(2)} / Stk</span>
            <button class="price-edit-btn" onclick="openManual('${item.id}')"><i class="fa-solid fa-pen"></i></button>
          </p>
        </div>
        <button class="del-btn" onclick="updateQty('${item.id}',-${item.qty})"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="cart-item-bottom">
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="updateQty('${item.id}',-1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty('${item.id}',1)" ${item.qty >= item.stock ? 'disabled' : ''}>+</button>
        </div>
        <div class="line-total">CHF ${(item.price * item.qty).toFixed(2)}</div>
      </div>
    </div>`
  }).join('')
}

// ── Panel switch ──────────────────────────────────────────────────────────────
function showPanel(name) {
  if (name === 'pay') beepPay()
  document.getElementById('panel-cart').style.display = name === 'cart' ? 'flex' : 'none'
  document.getElementById('panel-pay').style.display  = name === 'pay'  ? 'flex' : 'none'
}

// ── Total ─────────────────────────────────────────────────────────────────────
function calcTotal() {
  const rawSub = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discAmt = rawSub * (cartDiscount / 100)
  const sub = rawSub - discAmt
  const vat = sub * 0.081
  const total = sub + vat
  return { sub, vat, total, rawSub, discAmt }
}

// ── Descuento ─────────────────────────────────────────────────────────────────
function setDiscount(pct) {
  cartDiscount = pct
  renderDiscountBtns()
  updateTotal()
}

function renderDiscountBtns() {
  document.querySelectorAll('.disc-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.d) === cartDiscount)
  })
}

// ── Cash numpad ───────────────────────────────────────────────────────────────
function cashPad(k) {
  if (k === '⌫') { cashPadVal = cashPadVal.slice(0, -1) }
  else if (k === '.' && cashPadVal.includes('.')) return
  else if (cashPadVal.length >= 8) return
  else cashPadVal += k
  renderCashDisplay()
  updateChange()
}

function setCashAmount(v) {
  cashPadVal = String(v)
  renderCashDisplay()
  updateChange()
}

function renderCashDisplay() {
  const el = document.getElementById('cash-display')
  if (!cashPadVal) { el.textContent = '—'; el.classList.remove('has-val'); return }
  const num = parseFloat(cashPadVal) || 0
  el.textContent = num.toFixed(cashPadVal.includes('.') ? Math.min(2, (cashPadVal.split('.')[1]||'').length) : 2)
  el.classList.add('has-val')
}

function updateTotal() {
  const { sub, vat, total } = calcTotal()
  const count = cart.reduce((s, i) => s + i.qty, 0)
  document.getElementById('total-amount').innerHTML = `${total.toFixed(2)} <span>CHF</span>`
  document.getElementById('td-items').textContent = `${count} Artikel`
  document.getElementById('td-sub').textContent = `CHF ${sub.toFixed(2)}`
  document.getElementById('td-vat').textContent = `CHF ${vat.toFixed(2)}`
  document.getElementById('total-details').classList.toggle('visible', count > 0)
  document.getElementById('confirm-total').textContent = `CHF ${total.toFixed(2)}`
  document.getElementById('pay-open-total').textContent = `CHF ${total.toFixed(2)}`
  document.getElementById('pay-open-btn').disabled = cart.length === 0
  buildQuickAmounts(total)
  updateChange()
  checkConfirm()
}

// ── Payment ───────────────────────────────────────────────────────────────────
function setPay(m) {
  payMethod = m
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.toggle('active', b.dataset.pay === m))
  document.getElementById('cash-box').classList.toggle('visible', m === 'cash')
  checkConfirm()
}

function buildQuickAmounts(total) {
  const amts = [total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, 50, 100, 200]
    .filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 6)
  document.getElementById('quick-amounts').innerHTML = amts.map(v =>
    `<button class="quick-amt" onclick="setCashAmount('${v.toFixed(2)}')">${v % 1 === 0 ? v : v.toFixed(2)}.-</button>`
  ).join('')
}

function updateChange() {
  const { total } = calcTotal()
  const given = parseFloat(cashPadVal || 0)
  const change = given - total
  const el = document.getElementById('change-display')
  if (!cashPadVal) { el.className = ''; return }
  if (change >= 0) {
    el.className = 'ok'
    document.getElementById('change-label').textContent = 'Rückgeld'
    document.getElementById('change-amount').textContent = `CHF ${change.toFixed(2)}`
  } else {
    el.className = 'err'
    document.getElementById('change-label').textContent = 'Fehlt noch'
    document.getElementById('change-amount').textContent = `CHF ${Math.abs(change).toFixed(2)}`
  }
  checkConfirm()
}

function checkConfirm() {
  const { total } = calcTotal()
  const given = parseFloat(cashPadVal || 0)
  const ok = cart.length > 0 && (payMethod !== 'cash' || (given >= total && !!cashPadVal))
  document.getElementById('confirm-btn').disabled = !ok
}

// ── Confirm ───────────────────────────────────────────────────────────────────
let saleData = {}

function confirmSale() {
  beepConfirm()
  const { sub, vat, total, rawSub, discAmt } = calcTotal()
  const given = parseFloat(cashPadVal || 0)
  const change = given - total
  const now = new Date()
  const t = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  const d = now.toLocaleDateString('de-CH')
  saleNote = (document.getElementById('sale-note').value || '').trim()

  saleData = { sub, vat, total, rawSub, discAmt, discount: cartDiscount, given, change, t, d, bon: bonNo, items: [...cart], pay: payMethod, note: saleNote }
  saveSale(saleData)
  localStorage.setItem('kasse_bon', bonNo + 1)

  document.getElementById('success-meta').textContent = `Bon #${bonNo} · ${t}`
  document.getElementById('success-total').textContent = `CHF ${total.toFixed(2)}`
  document.getElementById('success-overlay').classList.add('visible')
  bonNo++
}

function closeSale() {
  document.getElementById('success-overlay').classList.remove('visible')
  cart = []; cartDiscount = 0; renderCart(); updateTotal(); renderDiscountBtns()
  cashPadVal = ''; renderCashDisplay()
  document.getElementById('change-display').className = ''
  document.getElementById('sale-note').value = ''
  showPanel('cart')
  if (!('ontouchstart' in window)) document.getElementById('barcode').focus()
}

function printTicket() {
  const { sub, vat, total, rawSub, discAmt, discount, given, change, t, d, bon, items, pay, note } = saleData

  document.getElementById('tk-meta').innerHTML =
    `<div>${d} · ${t}</div><div>Bon #${bon}</div>`

  document.getElementById('tk-items').innerHTML = items.map(i =>
    `<div class="tk-item">
      <span class="tk-qty">${i.qty}×</span>
      <span class="tk-name">${i.name}</span>
      <span class="tk-price">CHF ${(i.price * i.qty).toFixed(2)}</span>
    </div>`
  ).join('')

  const discRow = (discount > 0)
    ? `<div class="tk-row"><span>Brutto</span><span>CHF ${(rawSub||sub).toFixed(2)}</span></div>
       <div class="tk-row"><span>Rabatt ${discount}%</span><span>-CHF ${(discAmt||0).toFixed(2)}</span></div>`
    : ''

  const noteRow = note ? `<div style="font-size:10px;margin:4px 0;font-style:italic">${note}</div>` : ''

  document.getElementById('tk-total').innerHTML =
    `${discRow}
     <div class="tk-row"><span>Subtotal</span><span>CHF ${sub.toFixed(2)}</span></div>
     <div class="tk-row"><span>MwSt. 8.1%</span><span>CHF ${vat.toFixed(2)}</span></div>
     <div class="tk-row tk-bold"><span>TOTAL</span><span>CHF ${total.toFixed(2)}</span></div>
     <div class="tk-row"><span>Zahlung (${payLabels[pay] || pay})</span><span>${pay === 'cash' ? `CHF ${given.toFixed(2)}` : '—'}</span></div>
     ${noteRow}`

  document.getElementById('tk-change').innerHTML = (pay === 'cash' && change > 0)
    ? `<div class="tk-row tk-bold"><span>Rückgeld</span><span>CHF ${change.toFixed(2)}</span></div>`
    : ''

  window.print()
  closeSale()
}

// ── QR Bon ────────────────────────────────────────────────────────────────────
function showReceiptQR() {
  const { sub, vat, total, given, change, t, d, bon, items, pay } = saleData

  // Payload compacto para mantener QR pequeño
  const payload = {
    b: bon, d, t,
    s: +sub.toFixed(2), v: +vat.toFixed(2), x: +total.toFixed(2),
    g: +given.toFixed(2), c: +change.toFixed(2),
    p: pay,
    i: items.map(i => [i.name.substring(0, 30), i.qty, +i.price.toFixed(2)])
  }
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))

  // Base URL: en producción usa location.origin, en local muestra aviso
  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const base = isLocal
    ? 'https://web.lweb.ch/caja/index.html'
    : (location.origin + location.pathname)
  const url = base + '?receipt=' + encoded

  document.getElementById('qr-meta').textContent = `Bon #${bon} · ${d} · CHF ${total.toFixed(2)}`

  const urlEl = document.getElementById('qr-url')
  if (isLocal) {
    urlEl.textContent = '⚠ Localhost: QR apunta a producción'
    urlEl.style.cssText = 'font-size:11px;color:#F59E0B;font-weight:700;margin-bottom:8px;display:block'
  } else {
    urlEl.textContent = ''
  }

  document.getElementById('qr-overlay').classList.add('visible')

  const container = document.getElementById('qr-container')
  container.innerHTML = ''

  if (typeof QRCode === 'undefined') {
    container.innerHTML = `<p style="color:#EF4444;font-size:13px;font-weight:700;padding:20px 0">QR-Bibliothek nicht geladen</p>`
    return
  }

  try {
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#111827',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    })
  } catch(e) {
    container.innerHTML = `<p style="color:#EF4444;font-size:13px;font-weight:700;padding:20px 0">Fehler: ${e.message}</p>`
  }
}

function closeQR() {
  document.getElementById('qr-overlay').classList.remove('visible')
}

function openReceiptExternal() {
  const { sub, vat, total, given, change, t, d, bon, items, pay } = saleData
  const payload = {
    b: bon, d, t,
    s: +sub.toFixed(2), v: +vat.toFixed(2), x: +total.toFixed(2),
    g: +given.toFixed(2), c: +change.toFixed(2),
    p: pay,
    i: items.map(i => [i.name.substring(0, 30), i.qty, +i.price.toFixed(2)])
  }
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const base = isLocal ? 'https://web.lweb.ch/caja/index.html' : (location.origin + location.pathname)
  window.open(base + '?receipt=' + encoded, '_blank')
}

function showReceiptPage(raw) {
  const d = raw.bon !== undefined ? raw : {
    bon: raw.b, d: raw.d, t: raw.t,
    sub: raw.s, vat: raw.v, total: raw.x,
    given: raw.g, change: raw.c, pay: raw.p,
    items: (raw.i || []).map(a => ({ name: a[0], qty: a[1], price: a[2] }))
  }
  const payLabelsR = { cash: 'Bar', card: 'Karte', twint: 'TWINT', invoice: 'Rechnung' }
  const filename = `bon-${d.bon}-${d.d.replace(/\./g,'-')}.png`
  const itemsHTML = d.items.map(i => `
    <div class="item">
      <span class="qty">${i.qty}×</span>
      <span class="name">${i.name}</span>
      <span class="price">CHF ${(i.price * i.qty).toFixed(2)}</span>
    </div>`).join('')

  document.open()
  document.write(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bon #${d.bon} · US-Fishing</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif}
  html{height:auto;overflow:auto}
  body{background:#F0F2F7;min-height:100vh;height:auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 60px}
  .card{background:#fff;margin:16px;border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  .badge{background:rgba(255,255,255,.18);margin:0 20px 20px;border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
  .badge-bon{font-size:13px;font-weight:700;color:rgba(255,255,255,.7)}
  .badge-dt{font-size:13px;font-weight:700;color:rgba(255,255,255,.7)}
  .body{padding:20px}
  .items{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
  .item{display:flex;align-items:baseline;gap:8px}
  .qty{font-size:13px;font-weight:800;color:#9CA3AF;min-width:24px}
  .name{flex:1;font-size:15px;font-weight:600;color:#1F2937}
  .price{font-size:15px;font-weight:800;color:#111827;white-space:nowrap}
  .divider{border:none;border-top:1.5px dashed #E2E6EE;margin:4px 0 16px}
  .row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
  .row span:first-child{color:#6B7280;font-weight:500}
  .row span:last-child{font-weight:700;color:#111827}
  .total-row{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 0;border-top:2px solid #E2E6EE;margin-top:8px}
  .total-row span:first-child{font-size:16px;font-weight:800;color:#374151}
  .total-row span:last-child{font-size:34px;font-weight:900;color:#2C5F2E}
  .pay-label{text-align:center;margin-top:16px;padding-top:14px;border-top:1px solid #F3F4F6;font-size:13px;color:#9CA3AF;font-weight:600}
  .footer{background:#F4F6FA;padding:18px 20px;text-align:center}
  .thanks{font-size:15px;font-weight:700;color:#374151}
  .addr{font-size:12px;color:#9CA3AF;margin-top:3px}
  .fbtns{display:flex;gap:10px;margin-top:16px}
  .fbtns button{flex:1;padding:14px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center;gap:8px}
  .fbtns button:first-child{background:#2C5F2E;color:white}
  .fbtns button:last-child{background:white;color:#374151;border:1.5px solid #E2E6EE}
  @media print{.fbtns{display:none}.card{margin:0;border-radius:0;box-shadow:none}body{background:#fff;padding:0}}
</style>
</head>
<body>
<div class="card" id="rc-card">
  <div style="background:#2C5F2E;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.7)">Bon #${d.bon}</span>
    <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.7)">${d.d} · ${d.t}</span>
  </div>
  <div class="body">
    <div class="items">${itemsHTML}</div>
    <hr class="divider">
    <div class="row"><span>Subtotal</span><span>CHF ${d.sub.toFixed(2)}</span></div>
    <div class="row"><span>MwSt. 8.1%</span><span>CHF ${d.vat.toFixed(2)}</span></div>
    <div class="total-row"><span>TOTAL</span><span>CHF ${d.total.toFixed(2)}</span></div>
    <div class="pay-label">Zahlung: ${payLabelsR[d.pay] || d.pay}</div>
  </div>
  <div class="footer">
    <div class="thanks">Danke für Ihren Einkauf!</div>
    <div class="addr">US-Fishing &amp; Huntingshop · Sevelen SG</div>
    <div class="fbtns">
      <button onclick="window.print()">🖨 Drucken</button>
    </div>
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script>
function doSave() {
  const btn = document.getElementById('save-btn') || document.getElementById('save-btn2')
  btn.classList.add('loading'); btn.textContent = '⏳'
  const capture = () => html2canvas(document.getElementById('rc-card'), {
    scale:3, useCORS:true, backgroundColor:'#ffffff', logging:false
  }).then(canvas => {
    const url = canvas.toDataURL('image/png')
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIOS) {
      const w = window.open();
      w.document.write('<img src="'+url+'" style="max-width:100%;display:block"><p style="font-family:sans-serif;color:#888;text-align:center;padding:12px;font-size:14px">Bild gedrückt halten → Sichern</p>')
    } else {
      const a = document.createElement('a'); a.download='${filename}'; a.href=url; a.click()
    }
    btn.classList.remove('loading'); btn.textContent='✓'
    setTimeout(()=>btn.textContent='💾', 2000)
  }).catch(()=>{ btn.classList.remove('loading'); btn.textContent='💾' })
  typeof html2canvas!=='undefined' ? capture() : (document.querySelector('script[src*=html2canvas]').onload=capture)
}
<\/script>
</body></html>`)
  document.close()
}

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', function () {
  const q = this.value.toLowerCase().trim()
  const el = document.getElementById('search-results')
  if (q.length < 2) { el.classList.remove('visible'); el.innerHTML = ''; return }
  const res = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)).slice(0, 8)
  el.innerHTML = res.map(p => {
    const imgs = getImages(p)
    const imgTag = imgs.length > 0
      ? `<img src="${imgs[0]}" data-pid="${p.id}" data-imgs='${JSON.stringify(imgs).replace(/'/g, "&#39;")}' data-idx="0" loading="lazy" onload="prodImgLoad(this)" onerror="prodImgError(this)">`
      : `<div style="width:34px;height:34px;border-radius:8px;background:#E8ECF3;flex-shrink:0;display:flex;align-items:center;justify-content:center">📦</div>`
    return `
    <div class="search-item" onclick="addToCart(${p.id});document.getElementById('search').value='';document.getElementById('search-results').classList.remove('visible');if(!('ontouchstart' in window))document.getElementById('barcode').focus()">
      ${imgTag}
      <span class="sname">${p.name}</span>
      <span class="sprice">CHF ${parseFloat(p.price).toFixed(2)}</span>
    </div>`
  }).join('')
  el.classList.toggle('visible', res.length > 0)
})

// ── Barcode scanner ───────────────────────────────────────────────────────────
document.getElementById('barcode').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && this.value.trim()) {
    addByBarcode(this.value.trim())
    this.value = ''
  }
})

// ── PIN ───────────────────────────────────────────────────────────────────────
let pinEntry = '', pinMode = 'check', pinNew1 = ''

// sessionStorage key — sobrevive recargas, se borra al cerrar el tab
const SESSION_KEY = 'kasse_session_ok'

function checkPin() {
  // Si ya se desbloqueó en esta sesión del navegador, no pedir de nuevo
  if (sessionStorage.getItem(SESSION_KEY) === '1') return
  pinMode = 'check'; pinEntry = ''
  document.getElementById('pin-subtitle').textContent = 'PIN eingeben'
  renderPinDots()
  document.getElementById('pin-overlay').classList.add('visible')
}

function lockKasse() {
  sessionStorage.removeItem(SESSION_KEY)
  closeTagesabschluss()
  checkPin()
}

function pinPress(k) {
  if (k === '⌫') { pinEntry = pinEntry.slice(0,-1) }
  else if (pinEntry.length < 4) { pinEntry += k }
  renderPinDots()
  if (pinEntry.length < 4) return
  if (pinMode === 'check') {
    if (pinEntry === (localStorage.getItem('kasse_pin') || '1234')) {
      sessionStorage.setItem(SESSION_KEY, '1')
      document.getElementById('pin-overlay').classList.remove('visible')
    } else { shakePinDots(); pinEntry = '' }
  } else if (pinMode === 'set1') {
    pinNew1 = pinEntry; pinEntry = ''; pinMode = 'set2'
    document.getElementById('pin-subtitle').textContent = 'PIN bestätigen'
    renderPinDots()
  } else if (pinMode === 'set2') {
    if (pinEntry === pinNew1) {
      localStorage.setItem('kasse_pin', pinEntry)
      document.getElementById('pin-overlay').classList.remove('visible')
    } else {
      shakePinDots(); pinEntry = ''; pinMode = 'set1'; pinNew1 = ''
      document.getElementById('pin-subtitle').textContent = 'Nicht gleich — nochmals'
      setTimeout(() => { document.getElementById('pin-subtitle').textContent = 'Neuen PIN eingeben' }, 1800)
    }
  }
}

function renderPinDots() {
  document.getElementById('pin-dots').innerHTML =
    [0,1,2,3].map(i => `<div class="pin-dot ${i < pinEntry.length ? 'filled' : ''}"></div>`).join('')
}

function shakePinDots() {
  const el = document.getElementById('pin-dots')
  el.classList.add('shake')
  setTimeout(() => { el.classList.remove('shake'); renderPinDots() }, 500)
}

function startChangePIN() {
  closeTagesabschluss()
  pinMode = 'set1'; pinEntry = ''; pinNew1 = ''
  document.getElementById('pin-subtitle').textContent = 'Neuen PIN eingeben'
  renderPinDots()
  document.getElementById('pin-overlay').classList.add('visible')
}

// ── Sales History ─────────────────────────────────────────────────────────────
function saveSale(data) {
  try {
    const h = JSON.parse(localStorage.getItem('kasse_sales') || '[]')
    h.push({ ...data, savedAt: Date.now() })
    if (h.length > 2000) h.splice(0, h.length - 2000)
    localStorage.setItem('kasse_sales', JSON.stringify(h))
  } catch {}
}

function getAllSales() {
  try { return JSON.parse(localStorage.getItem('kasse_sales') || '[]') } catch { return [] }
}

function getSalesForDate(dateStr) {
  return getAllSales().filter(s => s.d === dateStr)
}

function getSalesToday() {
  return getSalesForDate(new Date().toLocaleDateString('de-CH'))
}

function getSalesThisWeek() {
  const all = getAllSales()
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek)
  monday.setHours(0, 0, 0, 0)
  return all.filter(s => {
    const parts = (s.d || '').split('.')
    const sDate = new Date(+parts[2], +parts[1] - 1, +parts[0])
    return !isNaN(sDate) && sDate >= monday
  })
}

function getTopProducts(sales, limit = 12) {
  const map = {}
  sales.forEach(s => {
    ;(s.items || []).forEach(item => {
      if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 }
      map[item.name].qty += item.qty
      map[item.name].revenue += item.price * item.qty
    })
  })
  return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
const payLabels = { cash: 'Bar', card: 'Karte', twint: 'TWINT', invoice: 'Rechnung' }
const payIcons  = { cash: 'fa-money-bill-wave', card: 'fa-credit-card', twint: 'fa-mobile-screen', invoice: 'fa-file-invoice' }

function showTagesabschluss() {
  document.getElementById('body').style.display = 'none'
  document.getElementById('admin-page').style.display = 'flex'
  switchTaTab('today')
}

function closeTagesabschluss() {
  document.getElementById('admin-page').style.display = 'none'
  document.getElementById('body').style.display = 'flex'
}

function switchTaTab(tab) {
  document.querySelectorAll('.adm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))
  document.querySelectorAll('.ta-tab-panel').forEach(p => { p.style.display = 'none' })
  document.getElementById('ta-tab-' + tab).style.display = 'block'
  if (tab === 'today')         renderTaToday()
  else if (tab === 'week')     renderTaWeek()
  else if (tab === 'month')    renderTaMonth()
  else if (tab === 'products') renderTaProducts()
  else if (tab === 'admin')    renderTaAdmin()
}

function renderTaToday() {
  const today = new Date().toLocaleDateString('de-CH')
  const sales = getSalesForDate(today)
  const total = sales.reduce((s, x) => s + x.total, 0)
  const sub   = sales.reduce((s, x) => s + x.sub,   0)
  const vat   = sales.reduce((s, x) => s + x.vat,   0)
  const avgTicket  = sales.length ? total / sales.length : 0
  const totalItems = sales.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + i.qty, 0), 0)
  const byPay = { cash: 0, card: 0, twint: 0, invoice: 0 }
  sales.forEach(s => { if (s.pay in byPay) byPay[s.pay] += s.total })

  const hours = Array(24).fill(0)
  sales.forEach(s => { const h = parseInt((s.t || '00:00').split(':')[0]); hours[h] += s.total })
  const maxHour = Math.max(...hours, 0.01)
  const activeHours = hours.map((v, i) => ({ h: i, v })).filter(x => x.v > 0)

  const invoiceSales = sales.filter(s => s.pay === 'invoice')
  const invoiceTotal = invoiceSales.reduce((a, s) => a + s.total, 0)

  document.getElementById('ta-tab-today').innerHTML = `
    <div class="ta-kpi-grid">
      <div class="ta-kpi ta-kpi-main">
        <div class="ta-kpi-label">Umsatz heute · ${today}</div>
        <div class="ta-kpi-val">CHF ${total.toFixed(2)}</div>
        <div class="ta-kpi-sub">Netto CHF ${sub.toFixed(2)} · MwSt CHF ${vat.toFixed(2)}</div>
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Verkäufe</div>
        <div class="ta-kpi-val">${sales.length}</div>
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Ø Bon</div>
        <div class="ta-kpi-val">CHF ${avgTicket.toFixed(2)}</div>
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Artikel total</div>
        <div class="ta-kpi-val">${totalItems}</div>
      </div>
    </div>

    <div class="ta-section-grid">
      <div class="ta-section-box">
        <div class="label">Nach Zahlungsart</div>
        ${Object.entries(byPay).filter(([, v]) => v > 0).map(([k, v]) => `
          <div class="ta-pay-row">
            <span>${fi(payIcons[k])} ${payLabels[k]}</span>
            <div class="ta-pay-bar-wrap"><div class="ta-pay-bar" style="width:${(v / (total || 1) * 100).toFixed(1)}%"></div></div>
            <span class="ta-pay-val">CHF ${v.toFixed(2)}</span>
          </div>`).join('') || '<p class="ta-empty">Keine Daten</p>'}
        ${invoiceSales.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #E2E6EE;font-size:12px;color:#6B7280">
          ${invoiceSales.length} offene Rechnung${invoiceSales.length > 1 ? 'en' : ''} · CHF ${invoiceTotal.toFixed(2)}</div>` : ''}
      </div>
      ${activeHours.length ? `
      <div class="ta-section-box">
        <div class="label">Umsatz nach Stunde</div>
        <div class="ta-hour-chart">
          ${activeHours.map(({ h, v }) => `
            <div class="ta-hour-bar-wrap" title="${h}:00 – CHF ${v.toFixed(2)}">
              <div class="ta-hour-bar" style="height:${(v / maxHour * 100).toFixed(0)}%"></div>
              <div class="ta-hour-label">${h}</div>
            </div>`).join('')}
        </div>
      </div>` : '<div class="ta-section-box"><div class="label">Umsatz nach Stunde</div><p class="ta-empty">Keine Daten</p></div>'}
    </div>

    <div class="ta-section-box">
      <div class="label">Verkäufe heute (${sales.length})</div>
      ${[...sales].map((s, i) => ({ s, i })).reverse().map(({ s, i }) => `
        <div class="ta-sale-row2" onclick="toggleSaleDetail(this)">
          <span class="ta-sale-bon">Bon #${s.bon}</span>
          <span class="ta-sale-time">${s.t}</span>
          <span class="ta-sale-pay">${payLabels[s.pay] || s.pay}</span>
          ${s.discount > 0 ? `<span class="ta-sale-disc">-${s.discount}%</span>` : ''}
          <span class="ta-sale-total">CHF ${s.total.toFixed(2)}</span>
          <button class="ta-reprint-btn" onclick="event.stopPropagation();reprintSale(${i})" title="Bon drucken"><i class="fa-solid fa-print"></i></button>
          <i class="fa-solid fa-chevron-down ta-chevron"></i>
        </div>
        <div class="ta-sale-detail" style="display:none">
          ${(s.items || []).map(i2 => `<div class="ta-detail-row"><span>${i2.qty}× ${i2.name}</span><span>CHF ${(i2.price * i2.qty).toFixed(2)}</span></div>`).join('')}
          ${s.note ? `<div class="ta-detail-row" style="font-style:italic;color:var(--text3)"><span>Notiz: ${s.note}</span></div>` : ''}
        </div>`).join('') || '<p class="ta-empty">Noch keine Verkäufe heute</p>'}
    </div>
  `
}

function toggleSaleDetail(row) {
  const detail = row.nextElementSibling
  const icon = row.querySelector('.ta-chevron')
  const visible = detail.style.display !== 'none'
  detail.style.display = visible ? 'none' : 'block'
  icon.style.transform = visible ? '' : 'rotate(180deg)'
}

function renderTaWeek() {
  const all = getAllSales()
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - dayOfWeek + i)
    const dateStr = d.toLocaleDateString('de-CH')
    const daySales = all.filter(s => s.d === dateStr)
    return {
      label: dayNames[(d.getDay() + 6) % 7],
      dateStr,
      total: daySales.reduce((s, x) => s + x.total, 0),
      count: daySales.length,
      isToday: i === dayOfWeek,
      isFuture: i > dayOfWeek
    }
  })

  const prevDayTotals = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - dayOfWeek + i - 7)
    const dateStr = d.toLocaleDateString('de-CH')
    return all.filter(s => s.d === dateStr).reduce((s, x) => s + x.total, 0)
  })

  const weekTotal    = days.reduce((s, d) => s + d.total, 0)
  const weekCount    = days.reduce((s, d) => s + d.count, 0)
  const prevWeekTotal = prevDayTotals.reduce((s, v) => s + v, 0)
  const weekDiff     = weekTotal - prevWeekTotal
  const weekDiffPct  = prevWeekTotal > 0 ? weekDiff / prevWeekTotal * 100 : null
  const maxDay       = Math.max(...days.map(d => d.total), 0.01)
  const maxPrev      = Math.max(...prevDayTotals, 0.01)

  document.getElementById('ta-tab-week').innerHTML = `
    <div class="ta-kpi-grid">
      <div class="ta-kpi ta-kpi-main">
        <div class="ta-kpi-label">Umsatz diese Woche</div>
        <div class="ta-kpi-val">CHF ${weekTotal.toFixed(2)}</div>
        ${weekDiffPct !== null ? `<div class="ta-kpi-sub ${weekDiff >= 0 ? 'ta-pos' : 'ta-neg'}">${weekDiff >= 0 ? '▲' : '▼'} CHF ${Math.abs(weekDiff).toFixed(2)} (${Math.abs(weekDiffPct).toFixed(1)}%) vs Vorwoche</div>` : ''}
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Verkäufe</div>
        <div class="ta-kpi-val">${weekCount}</div>
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Ø Bon</div>
        <div class="ta-kpi-val">CHF ${(weekCount ? weekTotal / weekCount : 0).toFixed(2)}</div>
      </div>
      <div class="ta-kpi">
        <div class="ta-kpi-label">Ø Tag</div>
        <div class="ta-kpi-val">CHF ${(weekTotal / 7).toFixed(2)}</div>
      </div>
    </div>

    <div class="ta-section-box">
      <div class="label">Tagesumsatz (Mo–So)</div>
      <div class="ta-week-chart">
        ${days.map((d, i) => `
          <div class="ta-week-col ${d.isToday ? 'ta-today-col' : ''}">
            <div class="ta-week-val">${d.total > 0 ? `${d.total.toFixed(0)}` : ''}</div>
            <div class="ta-week-bar-wrap">
              <div class="ta-week-bar" style="height:${d.isFuture ? 0 : (d.total / maxDay * 100).toFixed(0)}%"></div>
            </div>
            <div class="ta-week-day">${d.label}</div>
            <div class="ta-week-count">${d.count > 0 ? d.count : '—'}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="ta-section-grid">
      <div class="ta-section-box">
        <div class="label">Diese Woche</div>
        ${days.filter(d => !d.isFuture).map(d => `
          <div class="ta-row ${d.isToday ? 'ta-today-row' : ''}">
            <span>${d.label} <span style="color:#9CA3AF;font-size:11px">${d.dateStr}</span></span>
            <span style="display:flex;gap:12px;align-items:center">
              <span style="color:#9CA3AF;font-size:12px">${d.count} Verk.</span>
              <span>${d.total > 0 ? `CHF ${d.total.toFixed(2)}` : '—'}</span>
            </span>
          </div>`).join('')}
      </div>
      <div class="ta-section-box">
        <div class="label">Vorwoche (Vergleich)</div>
        ${days.map((d, i) => `
          <div class="ta-row">
            <span>${d.label}</span>
            <span style="display:flex;gap:12px;align-items:center">
              <span style="color:${prevDayTotals[i] > 0 && d.total >= prevDayTotals[i] ? '#16a34a' : '#dc2626'};font-size:12px">
                ${prevDayTotals[i] > 0 && d.total > 0 ? (d.total >= prevDayTotals[i] ? '▲' : '▼') : ''}
              </span>
              <span style="color:#9CA3AF">${prevDayTotals[i] > 0 ? `CHF ${prevDayTotals[i].toFixed(2)}` : '—'}</span>
            </span>
          </div>`).join('')}
        <div class="ta-row" style="border-top:2px solid #E2E6EE;margin-top:4px;padding-top:10px">
          <span style="font-weight:800">Total Vorwoche</span>
          <span>${prevWeekTotal > 0 ? `CHF ${prevWeekTotal.toFixed(2)}` : '—'}</span>
        </div>
      </div>
    </div>
  `
}

function renderTaProducts() {
  const today = new Date().toLocaleDateString('de-CH')
  const todaySales = getSalesForDate(today)
  const weekSales  = getSalesThisWeek()
  const topToday   = getTopProducts(todaySales, 12)
  const topWeek    = getTopProducts(weekSales, 12)
  const maxT = topToday[0]?.revenue || 0.01
  const maxW = topWeek[0]?.revenue  || 0.01

  const renderList = (list, max) => list.length
    ? list.map((p, i) => `
        <div class="ta-prod-row">
          <span class="ta-prod-rank">${i + 1}</span>
          <span class="ta-prod-name">${p.name}</span>
          <span class="ta-prod-qty">${p.qty}×</span>
          <span class="ta-prod-rev">CHF ${p.revenue.toFixed(2)}</span>
        </div>
        <div style="height:3px;background:#E2E6EE;border-radius:2px;margin:1px 0 5px 28px">
          <div style="height:3px;background:#2C5F2E;border-radius:2px;width:${(p.revenue / max * 100).toFixed(0)}%"></div>
        </div>`).join('')
    : '<p class="ta-empty">Keine Daten</p>'

  // Category summary for week
  const catMap = {}
  weekSales.forEach(s => {
    const prod = products.find(p => (s.items || []).some(i => i.id == p.id))
    ;(s.items || []).forEach(item => {
      const p = products.find(x => x.id == item.id)
      const cat = p?.category || 'Sonstige'
      if (!catMap[cat]) catMap[cat] = { rev: 0, qty: 0 }
      catMap[cat].rev += item.price * item.qty
      catMap[cat].qty += item.qty
    })
  })
  const catList = Object.entries(catMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
  const maxCat = catList[0]?.[1].rev || 0.01

  const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 3).sort((a,b) => a.stock - b.stock).slice(0, 20)

  document.getElementById('ta-tab-products').innerHTML = `
    ${lowStock.length ? `
    <div class="ta-section-box" style="border-color:#fecaca;background:#FEF2F2">
      <div class="label" style="color:#dc2626">⚠ Kritischer Lagerbestand (≤ 3 Stk)</div>
      ${lowStock.map(p => `
        <div class="ta-prod-row">
          <span class="ta-prod-name" style="color:var(--text)">${p.name}</span>
          <span class="ta-prod-qty" style="color:${p.stock<=1?'#dc2626':'#f59e0b'};font-weight:900">${p.stock} Stk</span>
        </div>`).join('')}
    </div>` : ''}
    <div class="ta-section-grid">
      <div class="ta-section-box">
        <div class="label">Top Produkte heute</div>
        ${renderList(topToday, maxT)}
      </div>
      <div class="ta-section-box">
        <div class="label">Top Produkte diese Woche</div>
        ${renderList(topWeek, maxW)}
      </div>
    </div>
    ${catList.length ? `
    <div class="ta-section-box">
      <div class="label">Umsatz nach Kategorie (Woche)</div>
      ${catList.map(([cat, { rev, qty }]) => `
        <div class="ta-pay-row">
          <span style="min-width:120px;font-size:13px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat}</span>
          <div class="ta-pay-bar-wrap"><div class="ta-pay-bar" style="width:${(rev / maxCat * 100).toFixed(0)}%"></div></div>
          <span class="ta-pay-val" style="min-width:100px">CHF ${rev.toFixed(2)} <span style="color:#9CA3AF;font-weight:600">(${qty}×)</span></span>
        </div>`).join('')}
    </div>` : ''}
  `
}

function renderTaAdmin() {
  const allSales = getAllSales()
  const storageKb = (new Blob([JSON.stringify(allSales)]).size / 1024).toFixed(1)
  const today = new Date().toLocaleDateString('de-CH')
  const todayCount = allSales.filter(s => s.d === today).length

  document.getElementById('ta-tab-admin').innerHTML = `
    <div class="ta-section-box">
      <div class="label">Kasse</div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Scan-Ton</div>
          <div class="ta-admin-desc">Piepton beim Scannen und Bezahlen</div>
        </div>
        <button class="ta-sound-toggle ${soundEnabled ? 'on' : ''}" onclick="toggleSound()">
          <span class="ts-track"><span class="ts-thumb"></span></span>
          <span class="ts-label">${soundEnabled ? 'Ein' : 'Aus'}</span>
        </button>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Dunkelmodus</div>
          <div class="ta-admin-desc">Dunkle Oberfläche für schwaches Licht</div>
        </div>
        <button class="ta-sound-toggle ${darkMode ? 'on' : ''}" onclick="toggleDark()">
          <span class="ts-track"><span class="ts-thumb"></span></span>
          <span class="ts-label">${darkMode ? 'Ein' : 'Aus'}</span>
        </button>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Bon-Nummer</div>
          <div class="ta-admin-desc">Aktuelle Bon-Nr: <strong>${bonNo}</strong></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="bon-input" type="number" value="${bonNo}" min="1"
            style="width:90px;padding:8px 12px;border:1.5px solid #E2E6EE;border-radius:10px;font-size:15px;font-weight:700;outline:none;text-align:center;background:#F4F6FA;color:#111827">
          <button class="ta-admin-btn ta-admin-btn-sec"
            onclick="const v=parseInt(document.getElementById('bon-input').value);if(v>0){bonNo=v;renderTaAdmin()}">
            Setzen
          </button>
        </div>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">PIN ändern</div>
          <div class="ta-admin-desc">Zugangs-PIN für die Kasse</div>
        </div>
        <button class="ta-admin-btn ta-admin-btn-sec" onclick="closeTagesabschluss();startChangePIN()">
          <i class="fa-solid fa-key"></i> PIN ändern
        </button>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Kasse sperren</div>
          <div class="ta-admin-desc">PIN-Bildschirm sofort anzeigen</div>
        </div>
        <button class="ta-admin-btn ta-admin-btn-danger" onclick="lockKasse()">
          <i class="fa-solid fa-lock"></i> Sperren
        </button>
      </div>
    </div>

    <div class="ta-section-box">
      <div class="label">Daten & Speicher</div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Verkaufshistorie</div>
          <div class="ta-admin-desc">${allSales.length} Einträge gesamt · ${storageKb} KB · Heute: ${todayCount}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="ta-admin-btn ta-admin-btn-sec" onclick="exportSalesCsv()">
            <i class="fa-solid fa-file-csv"></i> CSV
          </button>
          <button class="ta-admin-btn ta-admin-btn-sec" onclick="exportSales()">
            <i class="fa-solid fa-download"></i> JSON
          </button>
        </div>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Heutigen Tag löschen</div>
          <div class="ta-admin-desc">Entfernt alle ${todayCount} Verkäufe von heute</div>
        </div>
        <button class="ta-admin-btn ta-admin-btn-danger" onclick="deleteTodaySales()">
          <i class="fa-solid fa-trash"></i> Heute löschen
        </button>
      </div>
      <div class="ta-admin-row">
        <div>
          <div class="ta-admin-title">Gesamte Historie löschen</div>
          <div class="ta-admin-desc">Alle ${allSales.length} gespeicherten Verkäufe unwiderruflich löschen</div>
        </div>
        <button class="ta-admin-btn ta-admin-btn-danger" onclick="deleteAllSales()">
          <i class="fa-solid fa-trash"></i> Alle löschen
        </button>
      </div>
    </div>

    <div class="ta-section-box">
      <div class="label">App-Info</div>
      <div class="ta-row"><span>Filiale</span><span>Sevelen</span></div>
      <div class="ta-row"><span>MwSt.-Satz</span><span>8.1%</span></div>
      <div class="ta-row"><span>Produkte geladen</span><span>${products.length}</span></div>
      <div class="ta-row"><span>Kategorien</span><span>${categories.length}</span></div>
      <div class="ta-row"><span>Warenkorb (offen)</span><span>${cart.length} Positionen</span></div>
    </div>
  `
}

function exportSales() {
  const data = JSON.stringify(getAllSales(), null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kasse_verkäufe_${new Date().toLocaleDateString('de-CH').replace(/\./g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function deleteTodaySales() {
  const today = new Date().toLocaleDateString('de-CH')
  const count = getAllSales().filter(s => s.d === today).length
  if (!count) { alert('Keine Verkäufe heute vorhanden.'); return }
  if (!confirm(`${count} Verkäufe von heute (${today}) löschen?`)) return
  localStorage.setItem('kasse_sales', JSON.stringify(getAllSales().filter(s => s.d !== today)))
  renderTaAdmin()
}

function deleteAllSales() {
  const count = getAllSales().length
  if (!count) { alert('Keine Einträge vorhanden.'); return }
  if (!confirm(`ALLE ${count} Einträge löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
  localStorage.removeItem('kasse_sales')
  renderTaAdmin()
}

function printTagesabschluss() {
  const sales = getSalesToday()
  const today = new Date().toLocaleDateString('de-CH')
  const now   = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  const total = sales.reduce((s, x) => s + x.total, 0)
  const sub   = sales.reduce((s, x) => s + x.sub,   0)
  const vat   = sales.reduce((s, x) => s + x.vat,   0)
  const byPay = { cash: 0, card: 0, twint: 0, invoice: 0 }
  sales.forEach(s => { if (s.pay in byPay) byPay[s.pay] += s.total })
  const topProds = getTopProducts(sales, 10)

  document.getElementById('ta-ticket').innerHTML = `
    <div class="tk-shop">US-FISHING &amp; HUNTINGSHOP</div>
    <div class="tk-sub">Sevelen</div>
    <div class="tk-line"></div>
    <div style="text-align:center;font-size:13px;font-weight:bold;margin-bottom:4px">TAGESABSCHLUSS</div>
    <div style="text-align:center;font-size:11px;margin-bottom:6px">${today} · Druck: ${now}</div>
    <div class="tk-line"></div>
    <div class="tk-row"><span>Anzahl Verkäufe</span><span>${sales.length}</span></div>
    <div class="tk-row"><span>Subtotal (netto)</span><span>CHF ${sub.toFixed(2)}</span></div>
    <div class="tk-row"><span>MwSt. 8.1%</span><span>CHF ${vat.toFixed(2)}</span></div>
    <div class="tk-line"></div>
    <div class="tk-row tk-bold"><span>TOTAL</span><span>CHF ${total.toFixed(2)}</span></div>
    <div class="tk-line"></div>
    <div style="font-size:11px;font-weight:bold;margin-bottom:4px">NACH ZAHLUNGSART</div>
    ${Object.entries(byPay).filter(([, v]) => v > 0).map(([k, v]) =>
      `<div class="tk-row"><span>${payLabels[k]}</span><span>CHF ${v.toFixed(2)}</span></div>`).join('')}
    ${topProds.length ? `
    <div class="tk-line"></div>
    <div style="font-size:11px;font-weight:bold;margin-bottom:4px">TOP PRODUKTE</div>
    ${topProds.map(p => `<div class="tk-row"><span>${p.qty}× ${p.name}</span><span>CHF ${p.revenue.toFixed(2)}</span></div>`).join('')}` : ''}
    <div class="tk-line"></div>
    <div style="font-size:11px;font-weight:bold;margin-bottom:4px">VERKÄUFE</div>
    ${[...sales].reverse().map(s =>
      `<div class="tk-row"><span>Bon #${s.bon} ${s.t}</span><span>CHF ${s.total.toFixed(2)}</span></div>`).join('')}
    <div class="tk-line"></div>
    <div class="tk-footer">*** Ende Tagesabschluss ***</div>
  `
  window.print()
  document.getElementById('ta-ticket').innerHTML = ''
}

// ── Dark mode ─────────────────────────────────────────────────────────────────
function toggleDark() {
  darkMode = !darkMode
  localStorage.setItem('kasse_dark', darkMode ? 'on' : 'off')
  applyDark()
  renderTaAdmin()
}

function applyDark() {
  document.body.classList.toggle('dark', darkMode)
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportSalesCsv() {
  const sales = getAllSales()
  const rows = [['Datum','Uhrzeit','Bon','Zahlungsart','Netto','MwSt','Total','Rabatt%','Notiz','Artikel']]
  sales.forEach(s => {
    const items = (s.items || []).map(i => `${i.qty}x ${i.name}`).join(' | ')
    rows.push([
      s.d, s.t, s.bon,
      payLabels[s.pay] || s.pay,
      (s.sub||0).toFixed(2), (s.vat||0).toFixed(2), (s.total||0).toFixed(2),
      s.discount || 0,
      s.note || '',
      items
    ])
  })
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `kasse_export_${new Date().toLocaleDateString('de-CH').replace(/\./g,'-')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Reimpresión de bon ────────────────────────────────────────────────────────
function reprintSale(idx) {
  const sales = getAllSales()
  const s = sales[idx]
  if (!s) return
  const { sub, vat, total, rawSub, discAmt, discount, given, change, t, d, bon, items, pay, note } = s

  document.getElementById('tk-meta').innerHTML = `<div>${d} · ${t}</div><div>Bon #${bon} (Kopie)</div>`
  document.getElementById('tk-items').innerHTML = (items||[]).map(i =>
    `<div class="tk-item"><span class="tk-qty">${i.qty}×</span><span class="tk-name">${i.name}</span><span class="tk-price">CHF ${(i.price * i.qty).toFixed(2)}</span></div>`
  ).join('')
  const discRow = (discount > 0)
    ? `<div class="tk-row"><span>Brutto</span><span>CHF ${(rawSub||sub).toFixed(2)}</span></div><div class="tk-row"><span>Rabatt ${discount}%</span><span>-CHF ${(discAmt||0).toFixed(2)}</span></div>`
    : ''
  const noteRow = note ? `<div style="font-size:10px;margin:4px 0;font-style:italic">${note}</div>` : ''
  document.getElementById('tk-total').innerHTML =
    `${discRow}
     <div class="tk-row"><span>Subtotal</span><span>CHF ${sub.toFixed(2)}</span></div>
     <div class="tk-row"><span>MwSt. 8.1%</span><span>CHF ${vat.toFixed(2)}</span></div>
     <div class="tk-row tk-bold"><span>TOTAL</span><span>CHF ${total.toFixed(2)}</span></div>
     <div class="tk-row"><span>Zahlung (${payLabels[pay]||pay})</span><span>${pay==='cash'?`CHF ${(given||0).toFixed(2)}`:'—'}</span></div>${noteRow}`
  document.getElementById('tk-change').innerHTML = (pay === 'cash' && change > 0)
    ? `<div class="tk-row tk-bold"><span>Rückgeld</span><span>CHF ${change.toFixed(2)}</span></div>` : ''
  window.print()
}

// ── Vista mensual ─────────────────────────────────────────────────────────────
function renderTaMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const all = getAllSales()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const dateStr = d.toLocaleDateString('de-CH')
    const daySales = all.filter(s => s.d === dateStr)
    return { n: i + 1, dateStr, total: daySales.reduce((s, x) => s + x.total, 0), count: daySales.length }
  })
  const monthTotal = days.reduce((s, d) => s + d.total, 0)
  const monthCount = days.reduce((s, d) => s + d.count, 0)
  const maxDay = Math.max(...days.map(d => d.total), 0.01)
  const monthName = now.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })

  const byPay = { cash: 0, card: 0, twint: 0, invoice: 0 }
  all.filter(s => {
    const parts = (s.d||'').split('.'); const sd = new Date(+parts[2], +parts[1]-1, +parts[0])
    return sd.getFullYear() === year && sd.getMonth() === month
  }).forEach(s => { if (s.pay in byPay) byPay[s.pay] += s.total })

  document.getElementById('ta-tab-month').innerHTML = `
    <div class="ta-kpi-grid">
      <div class="ta-kpi ta-kpi-main">
        <div class="ta-kpi-label">Umsatz · ${monthName}</div>
        <div class="ta-kpi-val">CHF ${monthTotal.toFixed(2)}</div>
      </div>
      <div class="ta-kpi"><div class="ta-kpi-label">Verkäufe</div><div class="ta-kpi-val">${monthCount}</div></div>
      <div class="ta-kpi"><div class="ta-kpi-label">Ø Bon</div><div class="ta-kpi-val">CHF ${(monthCount ? monthTotal/monthCount : 0).toFixed(2)}</div></div>
      <div class="ta-kpi"><div class="ta-kpi-label">Ø Tag</div><div class="ta-kpi-val">CHF ${(monthTotal/daysInMonth).toFixed(2)}</div></div>
    </div>
    <div class="ta-section-grid">
      <div class="ta-section-box">
        <div class="label">Nach Zahlungsart</div>
        ${Object.entries(byPay).filter(([,v])=>v>0).map(([k,v])=>`
          <div class="ta-pay-row">
            <span>${fi(payIcons[k])} ${payLabels[k]}</span>
            <div class="ta-pay-bar-wrap"><div class="ta-pay-bar" style="width:${(v/(monthTotal||1)*100).toFixed(1)}%"></div></div>
            <span class="ta-pay-val">CHF ${v.toFixed(2)}</span>
          </div>`).join('') || '<p class="ta-empty">Keine Daten</p>'}
      </div>
      <div class="ta-section-box">
        <div class="label">Verkäufe pro Tag</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${days.map(d=>`
            <div title="${d.dateStr}: CHF ${d.total.toFixed(2)}" style="
              width:28px;height:28px;border-radius:6px;font-size:10px;font-weight:800;
              display:flex;align-items:center;justify-content:center;cursor:default;
              background:${d.count>0?`rgba(44,95,46,${Math.max(0.15,d.total/maxDay*0.9)})`:'var(--surface3)'};
              color:${d.count>0?'white':'var(--text3)'};">${d.n}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="ta-section-box">
      <div class="label">Tagesumsatz ${monthName}</div>
      <div class="ta-week-chart" style="height:120px">
        ${days.map(d=>`
          <div class="ta-week-col" style="min-width:0">
            <div class="ta-week-bar-wrap">
              <div class="ta-week-bar" style="height:${d.total>0?(d.total/maxDay*100).toFixed(0):0}%;background:${d.dateStr===new Date().toLocaleDateString('de-CH')?'linear-gradient(to top,var(--accent),#4ade80)':'var(--border2)'}"></div>
            </div>
            <div style="font-size:9px;color:var(--text3);font-weight:700">${d.n}</div>
          </div>`).join('')}
      </div>
    </div>
  `
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (!new URLSearchParams(location.search).has('receipt')) {
  applyDark()
  load()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/caja/sw.js')
}

// ── Atajos teclado ────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('pin-overlay').classList.contains('visible')) return
  if (document.getElementById('admin-page').style.display === 'flex') return
  if (e.key === 'F2') { e.preventDefault(); if (cart.length) showPanel('pay') }
  if (e.key === 'Escape') {
    e.preventDefault()
    if (document.getElementById('panel-pay').style.display !== 'none') showPanel('cart')
    else if (document.getElementById('success-overlay').classList.contains('visible')) closeSale()
    else if (document.getElementById('manual-overlay').classList.contains('visible')) closeManual()
    else if (document.getElementById('qr-overlay').classList.contains('visible')) closeQR()
  }
})
