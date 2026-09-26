-- Canonical Cart V5 schema migration (PostgreSQL).
--
-- The Order Service currently has no TypeORM migration runner configured.
-- Apply this file through the deployment database-migration step before
-- removing the service's compatible CREATE TABLE IF NOT EXISTS bootstrap.
-- Every statement is additive and safe for databases where the temporary
-- runtime tables already exist.

BEGIN;

CREATE SCHEMA IF NOT EXISTS orders;

CREATE TABLE IF NOT EXISTS orders.cart_metadata (
  user_id VARCHAR PRIMARY KEY,
  cart_id VARCHAR(200) NOT NULL UNIQUE,
  cart_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders.cart_mutation_operation (
  operation_id VARCHAR(200) PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  operation_type VARCHAR(64) NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade the temporary Batch-1 table without replacing or dropping rows.
ALTER TABLE orders.cart_mutation_operation
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_cart_mutation_operation_user_created
  ON orders.cart_mutation_operation (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_mutation_operation_type_created
  ON orders.cart_mutation_operation (operation_type, created_at DESC);

COMMIT;
