'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertIsolatedE2EDatabase } = require('./e2e-db-safety');

function withEnv(values, action) {
  const previous = { ...process.env };
  Object.assign(process.env, values);
  try { return action(); } finally { process.env = previous; }
}

test('accepts an explicit isolated local schema', () => withEnv({
  NODE_ENV: 'test', E2E_DB_SAFE: '1', DB_HOST: 'localhost', DB_SCHEMA: 'order_ci_unit',
}, () => assert.equal(assertIsolatedE2EDatabase('order').schema, 'order_ci_unit')));

test('rejects a canonical schema before any sync', () => withEnv({
  NODE_ENV: 'test', E2E_DB_SAFE: '1', DB_HOST: 'localhost', DB_SCHEMA: 'orders',
}, () => assert.throws(() => assertIsolatedE2EDatabase('order'), /must start with order_ci_/)));

test('rejects a remote database even with opt in', () => withEnv({
  NODE_ENV: 'test', E2E_DB_SAFE: '1', DB_HOST: 'production.example.com', DB_SCHEMA: 'order_ci_unit',
}, () => assert.throws(() => assertIsolatedE2EDatabase('order'), /not an allowed local\/CI host/)));
