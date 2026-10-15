// Load the vector renderer only when a map is opened. Leaflet keeps handling
// markers, measured routes and gestures; Street supplies sharp labels and POIs.
let renderer;
function script(src) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src; element.onload = resolve;
    element.onerror = () => { element.remove(); reject(new Error('map-renderer')); };
    document.head.appendChild(element);
  });
}
function loadRenderer(L) {
  if (!renderer) renderer = (async () => {
    window.L = L;
    if (!document.querySelector('[data-maplibre-css]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet';
      link.href = '/map-libs/maplibre-gl.css'; link.dataset.maplibreCss = '';
      document.head.appendChild(link);
    }
    if (!window.maplibregl) await script('/map-libs/maplibre-gl.js');
    if (!L.maplibreGL) await script('/map-libs/leaflet-maplibre-gl.js');
  })().catch(error => { renderer = undefined; throw error; });
  return renderer;
}

export function installDetailedBasemap(L, map, { tileKey, onLoaded = () => {}, onError = () => {} } = {}) {
  let disposed = false, vector, timer, failures = 0;
  const container = map.getContainer();
  container.dataset.basemap = 'raster';
  map.setMinZoom(1); map.setMaxBounds([[-85,-180],[85,180]]);
  const raster = L.tileLayer(tileKey
    ? 'https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey='+encodeURIComponent(tileKey)
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, detectRetina:!tileKey,
    attribution:tileKey ? '© Vietmap' : '© OpenStreetMap contributors',
  }).addTo(map);
  raster.on('tileload', () => { if (!disposed) { failures = 0; onLoaded(); } });
  raster.on('tileerror', () => { if (!disposed && ++failures >= 4) onError(); });
  const fallback = () => {
    clearTimeout(timer);
    if (disposed) return;
    if (vector && map.hasLayer(vector)) map.removeLayer(vector);
    vector = undefined;
    if (!map.hasLayer(raster)) raster.addTo(map);
    container.dataset.basemap = 'raster';
  };
  if (tileKey) loadRenderer(L).then(() => {
    if (disposed) return;
    vector = L.maplibreGL({
      style:'https://maps.vietmap.vn/maps/styles/tm/style.json?apikey='+encodeURIComponent(tileKey),
      attributionControl:{ customAttribution:'© Vietmap' },
    }).addTo(map);
    const gl = vector.getMaplibreMap();
    gl.once('load', () => {
      if (disposed || !vector) return;
      clearTimeout(timer); map.removeLayer(raster);
      container.dataset.basemap = 'vector-street'; onLoaded();
    });
    gl.on('error', fallback); gl.on('webglcontextlost', fallback);
    timer = setTimeout(fallback, 10000);
  }).catch(fallback);
  return () => { disposed = true; clearTimeout(timer); };
}
