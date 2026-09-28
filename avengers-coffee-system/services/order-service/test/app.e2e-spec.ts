import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { VoucherService } from '../src/modules/voucher/voucher.service';
import { WalletVoucherClaimOutboxService } from '../src/modules/thanh-toan/wallet-voucher-claim-outbox.service';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5433';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `order_ci_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'avengers-jwt-secret';

const { assertIsolatedE2EDatabase } = require('../../../test-utils/e2e-db-safety');
assertIsolatedE2EDatabase('order');

const { AppModule } = require('./../src/app.module');

describe('Order API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  const customerId = `ci-customer-${Date.now()}`;
  let orderId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    dataSource = moduleFixture.get(DataSource);
    for (const schema of new Set(dataSource.entityMetadatas.map(meta => meta.schema).filter(Boolean))) {
      await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${dataSource.driver.escape(schema!)}`);
    }
    await dataSource.synchronize();
    // SQL-managed checkout outbox is deliberately absent from TypeORM sync.
    // Create it only in this isolated e2e schema before module startup.
    await dataSource.query(`CREATE TABLE ${dataSource.driver.escape(process.env.DB_SCHEMA || 'orders')}.wallet_voucher_claim_outbox (
      order_id uuid PRIMARY KEY, customer_id varchar NOT NULL, voucher_code varchar(50) NOT NULL,
      discount_amount numeric(15,2) NOT NULL, status varchar(20) NOT NULL DEFAULT 'PENDING',
      attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
      , last_error text, error_code varchar(50), updated_at timestamptz NOT NULL DEFAULT now(), dead_at timestamptz
    )`);

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = jwtService.sign({
      sub: customerId,
      role: 'CUSTOMER',
      username: null,
      email: `${customerId}@test.com`,
      branchCode: null,
      branchName: null,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET / should return service banner', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Order service is running');
  });

  it('POST /customers/:id/cart/items should add cart item', async () => {
    const response = await request(app.getHttpServer())
      .post(`/customers/${customerId}/cart/items`)
      .send({
        itemId: 'sp-ci-01',
        name: 'CI Latte',
        price: 49000,
        quantity: 2,
      })
      .expect(201);

    expect(response.body?.customerId).toBe(customerId);
    expect(response.body?.totalItems).toBe(2);
    expect(response.body?.totalAmount).toBe(98000);
  });

  it('POST /customers/:id/orders should place order from cart', async () => {
    const response = await request(app.getHttpServer())
      .post(`/customers/${customerId}/orders`)
      .send({
        deliverySlot: '18:00 - 19:00',
        address: 'CI Address',
        note: 'Dat don tu CI',
      })
      .expect(201);

    expect(response.body?.message).toBe('Dat don thanh cong');
    expect(response.body?.order?.id).toBeDefined();
    expect(response.body?.order?.customerId).toBe(customerId);
    expect(response.body?.order?.totalAmount).toBeGreaterThan(0);
    expect(response.body?.order?.status).toBe('pending');
    orderId = response.body.order.id;
  });

  it('GET /customers/:id/orders should return order list with auth token', async () => {
    const response = await request(app.getHttpServer())
      .get(`/customers/${customerId}/orders`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body?.total).toBeDefined();
    expect(Array.isArray(response.body?.orders)).toBe(true);
  });

  it('keeps V5 cart_version and idempotency stable with real PostgreSQL UPDATE results', async () => {
    const v5Customer = `ci-v5-${Date.now()}`;
    const v5Token = jwtService.sign({ sub: v5Customer, role: 'CUSTOMER' });
    const schema = dataSource.driver.escape(process.env.DB_SCHEMA || 'orders');
    await dataSource.query(
      `INSERT INTO ${schema}.gio_hang (ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, so_luong)
       VALUES ($1, 1, 'CI Product', 49000, 1)`,
      [v5Customer],
    );
    const actionId = randomUUID();
    const clear = () => request(app.getHttpServer())
      .delete(`/cart/clear/${v5Customer}`)
      .set('Authorization', `Bearer ${v5Token}`)
      .set('x-idempotency-key', actionId);
    const first = await clear().expect(200);
    expect(first.body).toMatchObject({ cart_version: 1, affected: 1, already_processed: false });
    const replay = await clear().expect(200);
    expect(replay.body).toMatchObject({ cart_version: 1, already_processed: true });
    const read = await request(app.getHttpServer())
      .get(`/cart/${v5Customer}`)
      .set('Authorization', `Bearer ${v5Token}`)
      .expect(200);
    expect(read.body).toMatchObject({ cart_version: 1, items: [] });
  });

  it('retries a voucher claim and increments public usage once with real PostgreSQL UPDATE results', async () => {
    const schema = dataSource.driver.escape(process.env.DB_SCHEMA || 'orders');
    const orderId = randomUUID();
    const code = `CI_RETRY_${Date.now()}`;
    await dataSource.query(
      `INSERT INTO ${schema}.voucher (ma_voucher, gia_tri, loai_phan_phoi, luot_da_dung)
       VALUES ($1, 10000, 'PUBLIC', 0)`,
      [code],
    );
    await dataSource.query(
      `INSERT INTO ${schema}.wallet_voucher_claim_outbox
       (order_id, customer_id, voucher_code, discount_amount)
       VALUES ($1, $2, $3, 10000)`,
      [orderId, customerId, code],
    );

    const vouchers = app.get(VoucherService);
    const outbox = app.get(WalletVoucherClaimOutboxService);
    const claim = jest.spyOn(vouchers, 'claimIdentityVoucher')
      .mockRejectedValueOnce(new Error('Identity temporarily unavailable'))
      .mockResolvedValue(undefined);
    try {
      await outbox.processPending();
      const [pending] = await dataSource.query(
        `SELECT status, attempts FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
        [orderId],
      );
      expect(pending).toMatchObject({ status: 'PENDING', attempts: 1 });

      await dataSource.query(
        `UPDATE ${schema}.wallet_voucher_claim_outbox SET next_attempt_at = now() WHERE order_id = $1`,
        [orderId],
      );
      await outbox.processPending();
      const [done] = await dataSource.query(
        `SELECT status, attempts FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
        [orderId],
      );
      expect(done).toMatchObject({ status: 'DONE', attempts: 2 });
      await outbox.processPending();
      expect(claim).toHaveBeenCalledTimes(2);
      const [voucher] = await dataSource.query(
        `SELECT luot_da_dung FROM ${schema}.voucher WHERE ma_voucher = $1`,
        [code],
      );
      expect(voucher.luot_da_dung).toBe(1);
    } finally {
      claim.mockRestore();
    }
  });

  it('expires an abandoned hold and safely reacquires a still available voucher once', async () => {
    const schema = dataSource.driver.escape(process.env.DB_SCHEMA || 'orders');
    const heldOrderId = randomUUID();
    const code = `CI_LATE_${Date.now()}`;
    await dataSource.query(
      `INSERT INTO ${schema}.voucher (ma_voucher, gia_tri, loai_phan_phoi, luot_da_dung, tong_luot_dung)
       VALUES ($1, 10000, 'PUBLIC', 0, 1)`,
      [code],
    );
    await dataSource.query(
      `INSERT INTO ${schema}.wallet_voucher_claim_outbox
       (order_id, customer_id, voucher_code, discount_amount, status, created_at)
       VALUES ($1, $2, $3, 10000, 'WAITING_PAYMENT', now() - interval '40 minutes')`,
      [heldOrderId, customerId, code],
    );
    const outbox = app.get(WalletVoucherClaimOutboxService);
    await outbox.processPending();
    const expiredRows = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
      [heldOrderId],
    );
    expect(expiredRows[0].status).toBe('EXPIRED');
    const claim = jest
      .spyOn(app.get(VoucherService), 'claimIdentityVoucher')
      .mockResolvedValue(undefined);
    try {
      expect(await outbox.markReady(heldOrderId)).toBe(true);
      expect(await outbox.markReady(heldOrderId)).toBe(true);
      await outbox.processPending();
      expect(claim).toHaveBeenCalledTimes(1);
    } finally {
      claim.mockRestore();
    }
    const resumedRows = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
      [heldOrderId],
    );
    expect(resumedRows[0].status).toBe('DONE');
    const [voucher] = await dataSource.query<Array<{ luot_da_dung: number }>>(
      `SELECT luot_da_dung FROM ${schema}.voucher WHERE ma_voucher = $1`,
      [code],
    );
    expect(voucher.luot_da_dung).toBe(1);
  });

  it('does not revive an expired hold after another order used the last voucher', async () => {
    const schema = dataSource.driver.escape(process.env.DB_SCHEMA || 'orders');
    const heldOrderId = randomUUID();
    const code = `CI_SPENT_${Date.now()}`;
    await dataSource.query(
      `INSERT INTO ${schema}.voucher (ma_voucher, gia_tri, loai_phan_phoi, luot_da_dung, tong_luot_dung)
       VALUES ($1, 10000, 'PUBLIC', 1, 1)`,
      [code],
    );
    await dataSource.query(
      `INSERT INTO ${schema}.wallet_voucher_claim_outbox
       (order_id, customer_id, voucher_code, discount_amount, status, created_at)
       VALUES ($1, $2, $3, 10000, 'EXPIRED', now() - interval '40 minutes')`,
      [heldOrderId, customerId, code],
    );
    const outbox = app.get(WalletVoucherClaimOutboxService);
    const claim = jest.spyOn(app.get(VoucherService), 'claimIdentityVoucher');
    try {
      expect(await outbox.markReady(heldOrderId)).toBe(false);
      expect(await outbox.markReady(heldOrderId)).toBe(false);
      expect(claim).not.toHaveBeenCalled();
    } finally {
      claim.mockRestore();
    }
    const [row] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
      [heldOrderId],
    );
    expect(row.status).toBe('NEEDS_RECONCILIATION');
  });

  it('promotes a fresh payment hold and the worker claims it once', async () => {
    const schema = dataSource.driver.escape(process.env.DB_SCHEMA || 'orders');
    const heldOrderId = randomUUID();
    const code = `CI_FRESH_${Date.now()}`;
    await dataSource.query(
      `INSERT INTO ${schema}.voucher (ma_voucher, gia_tri, loai_phan_phoi, luot_da_dung)
       VALUES ($1, 10000, 'PUBLIC', 0)`,
      [code],
    );
    await dataSource.query(
      `INSERT INTO ${schema}.wallet_voucher_claim_outbox
       (order_id, customer_id, voucher_code, discount_amount, status)
       VALUES ($1, $2, $3, 10000, 'WAITING_PAYMENT')`,
      [heldOrderId, customerId, code],
    );
    const outbox = app.get(WalletVoucherClaimOutboxService);
    const claim = jest
      .spyOn(app.get(VoucherService), 'claimIdentityVoucher')
      .mockResolvedValue(undefined);
    try {
      expect(await outbox.markReady(heldOrderId)).toBe(true);
      await outbox.processPending();
      await outbox.processPending();
      expect(claim).toHaveBeenCalledTimes(1);
    } finally {
      claim.mockRestore();
    }
    const [row] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${schema}.wallet_voucher_claim_outbox WHERE order_id = $1`,
      [heldOrderId],
    );
    expect(row.status).toBe('DONE');
  });
});
