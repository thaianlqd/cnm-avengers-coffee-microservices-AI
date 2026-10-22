let renderer: Promise<any> | undefined;
export function loadMapRenderer() {
  if (!renderer) renderer = new Promise((resolve,reject) => {
    const browser = window as any;
    if (browser.maplibregl) { resolve(browser.maplibregl); return; }
    if (!document.querySelector('[data-analyst-map-css]')) {
      const link=document.createElement('link'); link.rel='stylesheet'; link.href='/map-libs/maplibre-gl.css';link.dataset.analystMapCss='';document.head.appendChild(link);
    }
    const script=document.createElement('script');script.src='/map-libs/maplibre-gl.js';
    script.onload=()=>resolve(browser.maplibregl);
    script.onerror=()=>{script.remove();renderer=undefined;reject(Error('Chưa nạp được bộ vẽ bản đồ.'));};
    document.head.appendChild(script);
  });
  return renderer;
}
