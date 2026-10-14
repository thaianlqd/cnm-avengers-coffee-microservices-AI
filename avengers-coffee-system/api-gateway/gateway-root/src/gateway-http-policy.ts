import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/** Bound persistent client connections without cutting off an active response. */
export function configureGatewayHttpServer(server: Server, env: NodeJS.ProcessEnv) {
  const count = Number(env.GATEWAY_MAX_REQUESTS_PER_SOCKET ?? 0);
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error('GATEWAY_MAX_REQUESTS_PER_SOCKET must be an integer from 0 to 10000');
  }
  server.maxRequestsPerSocket = count;
  if (!count) return undefined;
  const requests = new WeakMap<object, number>();
  server.prependListener('request', (req, res) => {
    const current = (requests.get(req.socket) ?? 0) + 1;
    requests.set(req.socket, current);
    if (current >= count) res.shouldKeepAlive = false;
  });
  return (proxyRes: IncomingMessage, _req: IncomingMessage, res: ServerResponse) => {
    if (proxyRes.statusCode === 101) return;
    // Backend hop-by-hop headers must not override this server's Connection:
    // close on its last allowed request. Otherwise the next request gets 503.
    // http-proxy reinserts Connection if it is missing, so removing it alone
    // is insufficient. Respect the public server's decision explicitly.
    if (!res.shouldKeepAlive) {
      proxyRes.headers.connection = 'close';
      delete proxyRes.headers['keep-alive'];
    }
  };
}
