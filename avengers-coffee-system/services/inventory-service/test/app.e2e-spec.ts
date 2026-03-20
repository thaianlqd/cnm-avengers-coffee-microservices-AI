import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `inventory_ci_${Date.now()}`;

const { AppModule } = require('./../src/app.module');

describe('Inventory API (e2e)', () => {
  let app: INestApplication<App>;
  const branchCode = 'CI_BRANCH';
  const productId = 91001;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET / should respond service banner', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('POST /inventory/items should create stock item', async () => {
    const response = await request(app.getHttpServer())
      .post('/inventory/items')
      .send({
        ma_san_pham: productId,
        so_luong_ton: 30,
        muc_canh_bao: 5,
        dang_kinh_doanh: true,
        branch_code: branchCode,
      })
      .expect(201);

    expect(response.body?.ma_san_pham).toBe(productId);
    expect(response.body?.so_luong_ton).toBe(30);
  });

  it('PATCH /inventory/items/:maSanPham/adjust should update stock quantity', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/inventory/items/${productId}/adjust`)
      .send({ delta: -8, branch_code: branchCode })
      .expect(200);

    expect(response.body?.ma_san_pham).toBe(productId);
    expect(response.body?.so_luong_ton).toBe(22);
  });

  it('GET /inventory/items should list adjusted stock item', async () => {
    const response = await request(app.getHttpServer())
      .get('/inventory/items')
      .query({ branch_code: branchCode })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    const item = response.body.find((row: any) => row.ma_san_pham === productId);
    expect(item).toBeDefined();
    expect(item.so_luong_ton).toBe(22);
  });
});
