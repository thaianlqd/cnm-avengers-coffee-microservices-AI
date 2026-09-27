import { CartService } from './cart.service';
import { quoteDeliveryFee } from './delivery-pricing';

describe('authoritative delivery pricing', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  const membership = (value = 0, minimum = 0, locked = false) => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ quyen_loi_hien_tai: {
      freeship_value: value, freeship_min_order: minimum, dac_quyen_khoa: locked,
    } }) })) as any;
  };
  it.each([undefined, 'LAY_TAI_QUAN', 'DUNG_TAI_CHO'])('has no fee for %s and never fetches membership', async mode => {
    global.fetch = jest.fn() as any;
    expect((await quoteDeliveryFee('user', 313000, mode)).delivery_fee).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('only delivery incurs the existing INTERNAL/LALAMOVE fees', async () => {
    membership();
    expect((await quoteDeliveryFee('user', 313000, 'GIAO_TAN_NOI', 'INTERNAL')).delivery_fee).toBe(15000);
    expect((await quoteDeliveryFee('user', 313000, 'GIAO_TAN_NOI', 'LALAMOVE')).delivery_fee).toBe(25000);
  });
  it('keeps configured threshold, cap, and privilege lock', async () => {
    membership(25000, 100000);
    expect((await quoteDeliveryFee('user', 99999, 'GIAO_TAN_NOI')).delivery_fee).toBe(15000);
    expect(await quoteDeliveryFee('user', 100000, 'GIAO_TAN_NOI')).toEqual({ delivery_fee_base: 15000, delivery_fee_discount: 15000, delivery_fee: 0 });
    membership(15000, 0, true);
    expect((await quoteDeliveryFee('user', 313000, 'GIAO_TAN_NOI')).delivery_fee).toBe(15000);
  });
  it.each([undefined, 'GIAO_TAN_NOI', 'LAY_TAI_QUAN', 'DUNG_TAI_CHO'])('cart quote matches payment total for %s', async mode => {
    membership();
    const voucher = { kiemTraVoucher: jest.fn(async () => ({so_tien_giam:62600,voucher:{ma_voucher:'SAVE20'}})) };
    const cart = new CartService({} as any, {} as any, voucher as any);
    jest.spyOn(cart, 'layGiỏHàng').mockResolvedValue({items:[],subtotal:313000,item_count:2} as any);
    const quote = await cart.quote('user','SAVE20',mode);
    expect(quote.final_total).toBe(mode === 'GIAO_TAN_NOI' ? 265400 : 250400);
    expect(quote.subtotal).toBe(313000);
    expect(quote.discount_amount).toBe(62600);
  });
  it('blocks an unverified benefit instead of charging an assumed amount', async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as any;
    await expect(quoteDeliveryFee('user', 313000, 'GIAO_TAN_NOI')).rejects.toThrow('freeship');
  });
});
