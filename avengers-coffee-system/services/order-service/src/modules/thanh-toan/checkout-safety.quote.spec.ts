import { ConflictException } from '@nestjs/common';
import { CartItem } from '../cart/cart.entity';
import { CheckoutSafetyService } from './checkout-safety.service';

describe('CheckoutSafetyService authoritative quote', () => {
  const input: any = {
    phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG',
    delivery_mode: 'LAY_TAI_QUAN', branch_code: 'BR-1', expected_cart_version: 7,
  };
  function fixture(stock: any[] = [{ ma_san_pham: 12, so_luong_ton: 2, dang_kinh_doanh: true }]) {
    const line: any = { id: 9, ma_nguoi_dung: 'u1', ma_san_pham: 12, ten_san_pham: 'Matcha',
      gia_ban: 1, so_luong: 2, size: 'Vừa', toppings: [] };
    const manager: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM "orders".cart_metadata')) return [{ cart_id: 'user:u1', cart_version: 7 }];
        if (sql.includes('FROM inventory.ton_kho_san_pham')) return stock;
        return [];
      }),
      getRepository: jest.fn((entity: any) => {
        if (entity === CartItem) return { find: jest.fn(async () => [line]) };
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    const dataSource: any = { query: jest.fn(async () => []), transaction: async (cb: any) => cb(manager) };
    const validator: any = { resolve: jest.fn(async () => ({ productName: 'Matcha', unitPrice: 49000, imageUrl: '' })) };
    return { service: new CheckoutSafetyService(dataSource, {} as any, validator), manager, validator };
  }

  it('uses Menu price and does not mutate cart_version during quote', async () => {
    const { service, manager } = fixture();
    const quote = await service.createQuote('u1', input);
    expect(quote.subtotal).toBe(98000);
    expect(quote.cart_version).toBe(7);
    expect(quote.items[0].unit_price).toBe(49000);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('SET cart_version'))).toBe(false);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('checkout_quote') && String(sql).includes('INSERT'))).toBe(true);
  });

  it.each([
    ['missing row', []],
    ['disabled row', [{ ma_san_pham: 12, so_luong_ton: 2, dang_kinh_doanh: false }]],
  ])('blocks %s without storing a quote', async (_name, rows) => {
    const { service, manager } = fixture(rows as any[]);
    await expect(service.createQuote('u1', input)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRANCH_AVAILABILITY_CONFLICT' }),
    });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "orders".checkout_quote'))).toBe(false);
  });

  it('allows an enabled branch row regardless of operational stock quantity', async () => {
    const { service, manager } = fixture([{ ma_san_pham: 12, so_luong_ton: 0, dang_kinh_doanh: true }]);
    await expect(service.createQuote('u1', input)).resolves.toMatchObject({ subtotal: 98000 });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('SET so_luong_ton'))).toBe(false);
  });

  it.each(['OPTION_REQUIRED', 'OPTION_UNAVAILABLE'])('rejects %s from the shared option validator', async (reason) => {
    const { service, validator } = fixture();
    validator.resolve.mockRejectedValue(new ConflictException({ code: 'REQUOTE_REQUIRED', reason }));
    await expect(service.createQuote('u1', input)).rejects.toMatchObject({
      response: expect.objectContaining({ reason, line_id: 9 }),
    });
  });

  it('blocks a second user-limited voucher while an earlier local claim is pending', async () => {
    const { service, manager } = fixture();
    (service as any).voucherService = {
      kiemTraVoucher: jest.fn(async () => ({
        voucher: { ma_voucher: 'SAVE' }, so_tien_giam: 1000,
        gioi_han_moi_nguoi: 1, luot_da_dung_user: 0,
      })),
    };
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "orders".cart_metadata')) return [{ cart_id: 'user:u1', cart_version: 7 }];
      if (sql.includes('checkout_voucher_claim') && sql.includes('COUNT')) return [{ count: 1 }];
      return [];
    });
    await expect(service.createQuote('u1', { ...input, ma_voucher: 'SAVE' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REQUOTE_REQUIRED', reason: 'VOUCHER_USER_LIMIT' }),
    });
  });
});
