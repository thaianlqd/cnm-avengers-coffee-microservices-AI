/** PostgreSQL concurrency contract for the strict-checkout SQL primitives.
 * Run with V5_TEST_PG_URL against an isolated disposable database. The suite
 * creates/drops only its own randomly named schema; it never touches orders.
 */
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

const pg = require('pg');
const databaseUrl = process.env.V5_TEST_PG_URL;
const run = databaseUrl ? describe : describe.skip;

run('strict checkout PostgreSQL concurrency contract', () => {
  const schema = `v5_closeout_${randomBytes(5).toString('hex')}`;
  let pool: any;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE "${schema}".cart_metadata (user_id text PRIMARY KEY, cart_version bigint NOT NULL)`);
    await pool.query(`CREATE TABLE "${schema}".cart_line (id integer PRIMARY KEY, user_id text NOT NULL)`);
    await pool.query(`CREATE TABLE "${schema}".checkout_operation (operation_id text PRIMARY KEY, request_hash text NOT NULL, result jsonb)`);
    await pool.query(`CREATE TABLE "${schema}".checkout_voucher_claim (order_id text, user_id text, voucher_code text, reconciled_at timestamptz,
      PRIMARY KEY (order_id, user_id, voucher_code))`);
    await pool.query(`CREATE TABLE "${schema}".customer_wallet_transaction (type text, reference_id text)`);
    await pool.query(`CREATE TABLE "${schema}".identity_usage (voucher_code text, user_id text, order_id text,
      PRIMARY KEY (voucher_code, user_id, order_id))`);
    const migration = readFileSync(join(__dirname, '../../../migrations/20260929_checkout_voucher_claim.sql'), 'utf8')
      .replace(/\borders\./g, `"${schema}".`);
    await pool.query(migration);
  });
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('allows one winner for a concurrent checkout operation key', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      const winner = await first.query(`INSERT INTO "${schema}".checkout_operation VALUES ('op-1', 'hash-1', '{"order_id":"o1"}')
        ON CONFLICT DO NOTHING RETURNING operation_id`);
      const loserPromise = second.query(`INSERT INTO "${schema}".checkout_operation VALUES ('op-1', 'hash-1', '{"order_id":"o2"}')
        ON CONFLICT DO NOTHING RETURNING operation_id`);
      await first.query('COMMIT');
      const loser = await loserPromise;
      await second.query('COMMIT');
      expect(winner.rowCount).toBe(1);
      expect(loser.rowCount).toBe(0);
      const rows = await pool.query(`SELECT result FROM "${schema}".checkout_operation WHERE operation_id='op-1'`);
      expect(rows.rows[0].result.order_id).toBe('o1');
    } finally {
      await first.query('ROLLBACK').catch(() => undefined);
      await second.query('ROLLBACK').catch(() => undefined);
      first.release(); second.release();
    }
  });

  it('rolls back order writes, cart clear, and version together on failure', async () => {
    await pool.query(`CREATE TABLE "${schema}".orders (id text PRIMARY KEY)`);
    await pool.query(`CREATE TABLE "${schema}".details (order_id text NOT NULL)`);
    await pool.query(`INSERT INTO "${schema}".cart_metadata VALUES ('u1', 7)`);
    await pool.query(`INSERT INTO "${schema}".cart_line VALUES (1, 'u1')`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO "${schema}".orders VALUES ('o-rollback')`);
      await client.query(`INSERT INTO "${schema}".details VALUES ('o-rollback')`);
      await client.query(`DELETE FROM "${schema}".cart_line WHERE user_id='u1'`);
      await client.query(`UPDATE "${schema}".cart_metadata SET cart_version=cart_version+1 WHERE user_id='u1'`);
      await client.query('ROLLBACK');
      expect((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".orders`)).rows[0].n).toBe(0);
      expect((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".details`)).rows[0].n).toBe(0);
      expect((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".cart_line`)).rows[0].n).toBe(1);
      expect((await pool.query(`SELECT cart_version FROM "${schema}".cart_metadata WHERE user_id='u1'`)).rows[0].cart_version).toBe('7');
    } finally { client.release(); }
  });

  it('deduplicates concurrent Identity usage and counts pending local voucher claims', async () => {
    await pool.query(`INSERT INTO "${schema}".checkout_voucher_claim VALUES ('o1','u1','SAVE',NULL)`);
    const count = await pool.query(`SELECT count(*)::int AS n FROM "${schema}".checkout_voucher_claim
      WHERE user_id='u1' AND voucher_code='SAVE' AND reconciled_at IS NULL`);
    expect(count.rows[0].n).toBe(1);
    const first = await pool.connect(); const second = await pool.connect();
    try {
      await first.query('BEGIN'); await second.query('BEGIN');
      const sql = `INSERT INTO "${schema}".identity_usage VALUES ('SAVE','u1','o1') ON CONFLICT DO NOTHING RETURNING order_id`;
      const winner = await first.query(sql);
      const loserPromise = second.query(sql);
      await first.query('COMMIT');
      const loser = await loserPromise;
      await second.query('COMMIT');
      expect(winner.rowCount).toBe(1);
      expect(loser.rowCount).toBe(0);
      await pool.query(`UPDATE "${schema}".checkout_voucher_claim SET reconciled_at=NOW() WHERE order_id='o1'`);
      const pending = await pool.query(`SELECT count(*)::int AS n FROM "${schema}".checkout_voucher_claim WHERE reconciled_at IS NULL`);
      const identity = await pool.query(`SELECT count(*)::int AS n FROM "${schema}".identity_usage`);
      expect(pending.rows[0].n + identity.rows[0].n).toBe(1);
    } finally {
      await first.query('ROLLBACK').catch(() => undefined);
      await second.query('ROLLBACK').catch(() => undefined);
      first.release(); second.release();
    }
  });
});
