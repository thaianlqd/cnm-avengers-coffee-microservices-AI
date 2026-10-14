import { createServer } from 'node:http';
import { configureGatewayHttpServer } from './gateway-http-policy';

describe('Gateway client connection budget', () => {
  it('leaves business timeouts unchanged and defaults to unlimited requests', () => {
    const server = createServer();
    const timeouts = [server.requestTimeout, server.headersTimeout, server.keepAliveTimeout];
    expect(configureGatewayHttpServer(server, {})).toBeUndefined();
    expect(server.maxRequestsPerSocket).toBe(0);
    expect([server.requestTimeout, server.headersTimeout, server.keepAliveTimeout]).toEqual(timeouts);
  });
  it.each(['-1', 'invalid', '1.5', '10001'])('rejects invalid configuration %s', value => {
    expect(() => configureGatewayHttpServer(createServer(), { GATEWAY_MAX_REQUESTS_PER_SOCKET: value })).toThrow();
  });
});
