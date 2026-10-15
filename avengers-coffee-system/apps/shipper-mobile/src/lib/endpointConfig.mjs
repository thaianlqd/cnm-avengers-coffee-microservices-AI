const loopback = host => ['localhost','127.0.0.1','::1','[::1]'].includes(host);
const privateHost = host => loopback(host) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
const parsed = value => { try { return new URL(value); } catch { return null; } };
export function resolveShipperEndpoint({ platform, webUrl, apiUrl, pageUrl, scriptUrl }) {
  const explicitWeb = parsed(webUrl), configured = parsed(apiUrl), page = parsed(pageUrl), metro = parsed(scriptUrl);
  if (platform === 'web') {
    if (explicitWeb) return explicitWeb.href.replace(/\/$/,'');
    if (configured && !privateHost(configured.hostname)) return configured.href.replace(/\/$/,'');
    if (page && privateHost(page.hostname)) {
      const host = loopback(page.hostname) ? '127.0.0.1' : page.hostname;
      return page.protocol+'//'+host+':3000';
    }
    if (configured) return configured.href.replace(/\/$/,'');
    throw new Error('Chưa cấu hình địa chỉ máy chủ giao hàng.');
  }
  if (configured && !privateHost(configured.hostname)) return configured.href.replace(/\/$/,'');
  if (metro && privateHost(metro.hostname)) return 'http://'+(loopback(metro.hostname) ? platform === 'android' ? '10.0.2.2' : '127.0.0.1' : metro.hostname)+':3000';
  if (configured) return configured.href.replace(/\/$/,'');
  return platform === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
}
