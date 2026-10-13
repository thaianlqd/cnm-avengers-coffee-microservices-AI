import type { Request, Response } from 'express';
import { createRequestLogger, requestLoggingEnabled } from './request-logging';

describe('Gateway request logging policy', () => {
  it.each([
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'development' }, true],
    [{}, true],
    [{ NODE_ENV: 'development', GATEWAY_REQUEST_LOGGING: 'false' }, false],
    [{ NODE_ENV: 'production', GATEWAY_REQUEST_LOGGING: 'true' }, true],
    [{ NODE_ENV: 'production', GATEWAY_REQUEST_LOGGING: ' TRUE ' }, true],
    [{ NODE_ENV: 'production', GATEWAY_REQUEST_LOGGING: 'invalid' }, false],
  ])('uses startup policy %j => %s', (env, expected) => {
    expect(requestLoggingEnabled(env)).toBe(expected);
  });

  it.each(['true', 'false'])('always forwards exactly once when flag=%s', flag => {
    const log = jest.fn();
    const next = jest.fn();
    const req = { method: 'GET', originalUrl: '/menu/danh-muc', headers: {} } as Request;
    createRequestLogger({ GATEWAY_REQUEST_LOGGING: flag }, log)(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(flag === 'true' ? 1 : 0);
  });
});
