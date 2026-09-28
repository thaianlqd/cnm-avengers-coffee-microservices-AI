import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `news_ci_${Date.now()}`;

const { assertIsolatedE2EDatabase } = require('../../../test-utils/e2e-db-safety');
assertIsolatedE2EDatabase('news');

const { AppModule } = require('./../src/app.module');

describe('News API (e2e)', () => {
  let app: INestApplication<App>;

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
