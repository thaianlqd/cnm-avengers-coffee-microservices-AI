import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'admin';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '123';
process.env.DB_NAME = process.env.DB_NAME || 'avengers_coffee';
process.env.DB_SCHEMA = process.env.DB_SCHEMA || `order_ci_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const { AppModule } = require('./../src/app.module');

describe('Order API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const customerId = `ci-customer-${Date.now()}`;
  let orderId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = jwtService.sign({
      id: customerId,
      role: 'CUSTOMER',
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
    orderId = response.body.order.id;
  });

  it('GET /customers/:id/orders should return created order', async () => {
    const response = await request(app.getHttpServer())
      .get(`/customers/${customerId}/orders`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body?.total).toBeGreaterThanOrEqual(1);
    const order = (response.body?.orders || []).find((row: any) => row.id === orderId);
    expect(order).toBeDefined();
  });
});
