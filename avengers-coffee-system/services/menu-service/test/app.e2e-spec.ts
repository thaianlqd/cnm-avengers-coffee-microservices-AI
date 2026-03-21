import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `menu_ci_${Date.now()}`;

const { AppModule } = require('./../src/app.module');

describe('Menu API (e2e)', () => {
  let app: INestApplication<App>;
  let categoryId: number;
  let itemId: string;

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

  it('GET / should return service banner', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Menu service is running');
  });

  it('GET /menu/categories should return category list', async () => {
    const response = await request(app.getHttpServer())
      .get('/menu/categories')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        code: expect.any(String),
        label: expect.any(String),
      }),
    );
  });

  it('POST /menu/categories should create a category', async () => {
    const response = await request(app.getHttpServer())
      .post('/menu/categories')
      .send({
        label: 'CI Test Category',
        icon: 'test-icon',
      })
      .expect(201);

    expect(response.body?.message).toBe('Them danh muc thanh cong');
    expect(response.body?.category?.id).toBeDefined();
    categoryId = response.body.category.id;
  });

  it('POST /menu/items should create item in created category', async () => {
    const response = await request(app.getHttpServer())
      .post('/menu/items')
      .send({
        name: 'CI Americano',
        category_code: categoryId,
        price: 55000,
        original_price: 65000,
        image: 'https://example.com/ci-americano.png',
        description: 'Created by CI test',
        dang_ban: true,
        la_hot: true,
        la_moi: false,
      })
      .expect(201);

    expect(response.body?.message).toBe('Them mon moi thanh cong');
    expect(response.body?.item?.id).toBeDefined();
    expect(response.body?.item?.name).toBe('CI Americano');
    itemId = response.body.item.id;
  });

  it('PATCH /menu/items/:id/status should mark item sold_out', async () => {
    const updateResponse = await request(app.getHttpServer())
      .patch(`/menu/items/${itemId}/status`)
      .send({ dang_ban: false })
      .expect(200);

    expect(updateResponse.body?.item?.status).toBe('sold_out');
    expect(updateResponse.body?.item?.dang_ban).toBe(false);

    const listResponse = await request(app.getHttpServer())
      .get('/menu/items')
      .query({ search: 'CI Americano' })
      .expect(200);

    expect(listResponse.body?.total).toBeGreaterThanOrEqual(1);
    const foundItem = (listResponse.body?.items || []).find((item: any) => item.id === itemId);
    expect(foundItem).toBeDefined();
    expect(foundItem.status).toBe('sold_out');
  });
});
