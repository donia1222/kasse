# Caja POS — US-Fishing & Huntingshop

Sistema de caja (punto de venta) PWA para US-Fishing & Huntingshop, Sevelen (Suiza).
Funciona en modo standalone en tablet/iPad en orientación landscape.

## Arquitectura

Aplicación web estática de un solo archivo sin framework ni bundler:
- `index.html` — estructura HTML completa (paneles, overlays, ticket de impresión)
- `app.js` — toda la lógica de la app (vanilla JS, ~660 líneas)
- `styles.css` — todos los estilos (~280 líneas)
- `manifest.json` — configuración PWA (scope `/caja/`, orientación landscape)
- `sw.js` — Service Worker para uso offline

## Stack y dependencias externas

- Vanilla JS / HTML / CSS puro — sin npm, sin build step
- Font Awesome 6.5.1 (CDN) — iconos
- API REST propia: `https://web.lweb.ch/templettedhop/`
  - `get_products.php` — productos con precio, stock, barcode, imágenes
  - `get_categories.php` — categorías (solo root: `parent_id === null`)
- Imágenes de productos: campo `image_urls`, `image_url_candidates`, `image_url` en la API
- Imágenes de categorías: Unsplash (URLs hardcodeadas en `CAT_BANNER_URLS`)

## Flujo principal

1. **Carga**: `load()` → API (con caché localStorage 5 min) → `renderCategories()`
2. **PIN lock**: se muestra al inicio (`checkPin()`), PIN por defecto `1234`, guardado en `localStorage('kasse_pin')`
3. **Añadir productos**: barcode scanner (input `#barcode`) o búsqueda o clic en categoría
4. **Carrito** (`cart[]`): panel izquierdo derecho (panel-cart)
5. **Pago** (panel-pay): métodos cash / Karte / TWINT / Rechnung. Solo cash requiere importe dado.
6. **Confirmación** (`confirmSale()`): guarda `saleData` y en `localStorage('kasse_sales')`, muestra overlay de éxito
7. **Impresión** (`printTicket()`): rellena `#ticket` (oculto en pantalla, visible en `@media print`) y llama `window.print()`
8. **Tagesabschluss**: resumen diario desde `localStorage('kasse_sales')`, imprimible con `printTagesabschluss()`

## Estado global

```js
let products = []      // todos los productos de la API
let categories = []    // categorías raíz
let cart = []          // items: { id, name, price, img, stock, qty }
let activeCat = null   // slug de categoría activa
let payMethod = 'cash' // método de pago seleccionado
let bonNo = 1042       // número de bon (se incrementa por venta, no persiste en localStorage)
let saleData = {}      // datos del último sale confirmado (para imprimir)
```

## Impuestos / IVA

MwSt. 8.1% (Suiza). `sub = precio neto`, `vat = sub * 0.081`, `total = sub + vat`.

## Impresión de bons

- `#ticket` y `#ta-ticket` están ocultos en pantalla, solo visibles en `@media print`
- `printTicket()` necesita desestructurar `{ sub, vat, total, given, change, t, d, bon, items, pay }` de `saleData`
- Después de imprimir el ticket de venta, se llama `closeSale()` automáticamente

## Persistencia (localStorage)

| Clave | Contenido |
|---|---|
| `kasse_pin` | PIN de 4 dígitos (default: `1234`) |
| `kasse_sales` | Array de ventas del día (máx 2000), objetos con `{ sub, vat, total, given, change, t, d, bon, items, pay, savedAt }` |
| `products` | Caché de productos (TTL 5 min) |
| `categories` | Caché de categorías (TTL 5 min) |

## Moneda y formato

CHF (francos suizos). Formato: `CHF 0.00`. Fechas en `de-CH`.
