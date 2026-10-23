// One raster renderer for store and delivery maps, including Expo's web iframe.
export const GOOGLE_STREET_TILES = 'https://mt1.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}';
export function installDetailedBasemap(L, map, { onLoaded = () => {}, onError = () => {} } = {}) {
  let disposed = false, failures = 0, loaded = false, timer;
  const layer = L.tileLayer(GOOGLE_STREET_TILES, {
    attribution: 'Map data © Google', maxZoom: 20, maxNativeZoom: 20,
    keepBuffer: 2, updateWhenIdle: true,
  });
  map.getContainer().dataset.basemap = 'google-streets';
  const fail = () => { if (!disposed) onError(); };
  layer.on('loading', () => { clearTimeout(timer); timer = setTimeout(fail, 10000); });
  layer.on('tileload', () => { loaded = true; failures = 0; if (!disposed) onLoaded(); });
  layer.on('load', () => { clearTimeout(timer); if (!loaded) fail(); });
  layer.on('tileerror', () => { if (++failures >= 3) fail(); });
  layer.addTo(map);
  return () => { disposed = true; clearTimeout(timer); layer.off(); if (map.hasLayer(layer)) map.removeLayer(layer); };
}
