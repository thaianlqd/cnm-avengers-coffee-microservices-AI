'use strict';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

function assertIsolatedE2EDatabase(service) {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const optIn = String(process.env.E2E_DB_SAFE || '');
  const host = String(process.env.DB_HOST || '').toLowerCase();
  const schema = String(process.env.DB_SCHEMA || '').toLowerCase();
  const safePrefix = `${String(service).toLowerCase()}_ci_`;
  const canonical = new Set(['public', 'menu', 'identity', 'inventory', 'orders', 'news']);

  if (nodeEnv !== 'test' || optIn !== '1') {
    throw new Error('E2E database mutation refused: require NODE_ENV=test and E2E_DB_SAFE=1');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`E2E database mutation refused: DB_HOST ${host || '(empty)'} is not an allowed local/CI host`);
  }
  if (!schema.startsWith(safePrefix) || canonical.has(schema) || !/^[a-z0-9_]+$/.test(schema)) {
    throw new Error(`E2E database mutation refused: DB_SCHEMA must start with ${safePrefix}`);
  }
  return { host, schema };
}

module.exports = { assertIsolatedE2EDatabase };
