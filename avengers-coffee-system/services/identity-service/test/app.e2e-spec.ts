import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `identity_ci_${Date.now()}`;

const { assertIsolatedE2EDatabase } = require('../../../test-utils/e2e-db-safety');
assertIsolatedE2EDatabase('identity');

const { AppModule } = require('./../src/app.module');

describe('Identity API (e2e)', () => {
  let app: INestApplication<App>;
  const email = `ci_${Date.now()}@example.com`;
  const password = '12345678';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const dataSource = moduleFixture.get(DataSource);
    for (const schema of new Set(dataSource.entityMetadatas.map(meta => meta.schema).filter(Boolean))) {
      await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${dataSource.driver.escape(schema!)}`);
    }
    await dataSource.synchronize();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /auth/register should create customer account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        hoTen: 'CI User',
      })
      .expect(201);

    expect(response.body?.message).toBeDefined();
    expect(response.body?.userId).toBeDefined();
  });

  it('POST /auth/login should return access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(201);

    expect(response.body?.accessToken).toBeDefined();
    expect(response.body?.user?.email).toBe(email);
  });

  it('POST /auth/login should reject wrong password', async () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'sai-mat-khau' })
      .expect(401);
  });

  it('claims an Order Service voucher once even without an Identity promotion row', async () => {
    const orderId = randomUUID();
    const body = { ma_khuyen_mai: 'LOCAL_CI_VOUCHER', user_id: 'ci-customer',
      ma_don_hang: orderId, so_tien_giam: 20000 };
    const first = await request(app.getHttpServer()).post('/promotions/xac-nhan-su-dung')
      .set('x-internal-token', process.env.INTERNAL_SERVICE_TOKEN || 'test-only-internal-service-token')
      .send(body).expect(201);
    const replay = await request(app.getHttpServer()).post('/promotions/xac-nhan-su-dung')
      .set('x-internal-token', process.env.INTERNAL_SERVICE_TOKEN || 'test-only-internal-service-token')
      .send(body).expect(201);
    expect(first.body.already_processed).toBe(false);
    expect(replay.body.already_processed).toBe(true);
    const count = await request(app.getHttpServer()).get('/promotions/luot-dung-user')
      .set('x-internal-token', process.env.INTERNAL_SERVICE_TOKEN || 'test-only-internal-service-token')
      .query({ code: body.ma_khuyen_mai, user_id: body.user_id }).expect(200);
    expect(count.body.luot_da_dung).toBe(1);
  });
});
