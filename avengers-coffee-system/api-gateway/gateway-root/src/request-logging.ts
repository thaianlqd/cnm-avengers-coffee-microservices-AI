import type { NextFunction, Request, Response } from 'express';

/** Decide once at startup; production defaults to no per-request stdout work. */
export function requestLoggingEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.GATEWAY_REQUEST_LOGGING !== undefined) {
    return env.GATEWAY_REQUEST_LOGGING.trim().toLowerCase() === 'true';
  }
  return env.NODE_ENV !== 'production';
}

export function createRequestLogger(env: NodeJS.ProcessEnv, log: (line: string) => void = console.log) {
  const enabled = requestLoggingEnabled(env);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (enabled) {
      log(`[Gateway] Incoming Request: ${req.method} ${req.originalUrl} from ${req.headers.origin || 'unknown origin'}`);
    }
    next();
  };
}
