import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';

const { AppModule } = require('./../src/app.module');

describe('News API (e2e)', () => {
  let app: INestApplication<App>;

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

  it('GET /news should return list format', async () => {
    const response = await request(app.getHttpServer())
      .get('/news')
      .expect(200);

    expect(Array.isArray(response.body?.items)).toBe(true);
    expect(typeof response.body?.total).toBe('number');
  });

  it('GET /news/featured/list should return array', async () => {
    const response = await request(app.getHttpServer())
      .get('/news/featured/list')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /news/category/khuyen-mai should return list format', async () => {
    const response = await request(app.getHttpServer())
      .get('/news/category/khuyen-mai')
      .expect(200);

    expect(Array.isArray(response.body?.items)).toBe(true);
    expect(typeof response.body?.total).toBe('number');
  });
});
