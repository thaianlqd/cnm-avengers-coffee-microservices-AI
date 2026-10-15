# Vendored map renderer

Lazy loaded only by map screens; no provider data, keys or fonts are embedded here.

- MapLibre GL JS **5.24.0**, browser bundle and CSS, BSD-3-Clause. Source: https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.24.0.tgz
- @maplibre/maplibre-gl-leaflet **0.1.4**, ISC (see bundled license). Source: https://registry.npmjs.org/@maplibre/maplibre-gl-leaflet/-/maplibre-gl-leaflet-0.1.4.tgz
- Preserve both LICENSE files when updating. The same browser assets are served by Customer Vite, Customer Expo Web and Shipper Expo Web.

Street style endpoint follows the existing Vietmap Tile key configuration: https://maps.vietmap.vn/docs/map-api/tilemap/ . If vector loading/WebGL fails, Leaflet retains the raster layer and existing markers/routes.
