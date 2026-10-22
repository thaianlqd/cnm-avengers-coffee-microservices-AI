const loopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const privateHost = host => loopback(host) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

const parseUrl = value => {
  if (!value || typeof value !== 'string') return null;
  try {
    const match = value.match(/^(https?:)\/\/([^:/?#]+)(?::(\d+))?([^?#]*)(\?[^#]*)?(#.*)?$/i);
    if (!match) return null;
    return {
      protocol: match[1].toLowerCase(),
      hostname: match[2],
      port: match[3] || '',
      pathname: match[4] || '/',
      href: value.replace(/\/+$/, ''),
    };
  } catch {
    return null;
  }
};

export function resolveShipperEndpoint({ platform, webUrl, apiUrl, pageUrl, scriptUrl }) {
  const explicitWeb = parseUrl(webUrl);
  const configured = parseUrl(apiUrl);
  const page = parseUrl(pageUrl);
  const metro = parseUrl(scriptUrl);

  if (platform === 'web') {
    if (explicitWeb?.href) return explicitWeb.href;
    if (configured?.hostname && !privateHost(configured.hostname)) return configured.href;
    if (page?.hostname && privateHost(page.hostname)) {
      const host = loopback(page.hostname) ? '127.0.0.1' : page.hostname;
      return page.protocol + '//' + host + ':3000';
    }
    if (configured?.href) return configured.href;
    throw new Error('Chưa cấu hình địa chỉ máy chủ giao hàng.');
  }

  if (configured?.hostname && !privateHost(configured.hostname)) return configured.href;
  if (metro?.hostname && privateHost(metro.hostname)) {
    const host = loopback(metro.hostname) ? (platform === 'android' ? '10.0.2.2' : '127.0.0.1') : metro.hostname;
    return 'http://' + host + ':3000';
  }
  if (configured?.href) return configured.href;
  return platform === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
}
