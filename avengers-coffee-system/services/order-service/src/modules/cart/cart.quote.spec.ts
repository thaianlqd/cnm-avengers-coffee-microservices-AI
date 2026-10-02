import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('authenticated cart quote HTTP contract', () => {
  let app: INestApplication;
  let token: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const voucher = { kiemTraVoucher: jest.fn(async () => ({ so_tien_giam: 61600, voucher: { ma_voucher: 'KS20_A' } })) };
    const service = new CartService({} as any, {} as any, voucher as any);
    jest.spyOn(service, 'layGiỏHàng').mockResolvedValue({ items: [], subtotal: 308000, item_count: 2 } as any);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'quote-regression-test-only' })],
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    token = module.get(JwtService).sign({ sub: 'customer', role: 'CUSTOMER' });
  });

  afterEach(async () => { global.fetch = originalFetch; await app.close(); });

  it.each([
    ['GIAO_TAN_NOI', 0, 15000, 261400],
    ['GIAO_TAN_NOI', 30000, 0, 246400],
    ['LAY_TAI_QUAN', 0, 0, 246400],
    ['DUNG_TAI_CHO', 0, 0, 246400],
  ])('returns 200 for %s with authoritative benefit %s', async (mode, benefit, fee, total) => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ quyen_loi_hien_tai: {
      freeship_value: benefit, freeship_min_order: 0, dac_quyen_khoa: false,
    } }) })) as any;
    const response = await request(app.getHttpServer()).post('/cart/customer/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ voucher_code: 'KS20_A', delivery_mode: mode, delivery_fee: 1, final_total: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ subtotal: 308000, discount_amount: 61600,
      delivery_fee: fee, final_total: total });
    if (mode !== 'GIAO_TAN_NOI') expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not expose another customer cart', async () => {
    global.fetch = jest.fn() as any;
    await request(app.getHttpServer()).post('/cart/other-customer/quote')
      .set('Authorization', `Bearer ${token}`).send({ delivery_mode: 'GIAO_TAN_NOI' }).expect(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
