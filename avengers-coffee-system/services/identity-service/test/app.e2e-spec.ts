import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `identity_ci_${Date.now()}`;

const { AppModule } = require('./../src/app.module');

describe('Identity API (e2e)', () => {
  let app: INestApplication<App>;
  const email = `ci_${Date.now()}@example.com`;
  const password = '12345678';

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
});
