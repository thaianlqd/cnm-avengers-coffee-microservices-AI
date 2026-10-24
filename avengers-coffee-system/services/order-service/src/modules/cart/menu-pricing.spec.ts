import { repriceCartLines, resolveMenuProduct } from './menu-pricing';

describe('scheduled menu pricing', () => {
  const product = { ma_san_pham: 1, ten_san_pham: 'Cà phê', gia_ban: 45000, effective_price: 30000, trang_thai: true };
  const variants = [{ ten_thuoc_tinh: 'Kích thước', gia_tri: 'Lớn', phu_thu: 55000 }, { ten_thuoc_tinh: 'Topping', gia_tri: 'Thạch', phu_thu: 5000 }];
  it('prices size and extras from menu while deduplicating legacy copied attributes', async () => {
    const query = jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce(variants);
    const priced = await resolveMenuProduct(query, { ma_san_pham: 1, size: 'Lớn', toppings: ['Thạch'], custom_attributes: { topping: ['Thạch'] }, gia_ban: 1 });
    expect(priced.unitPrice).toBe(45000);
    expect(query.mock.calls[0][0]).toContain('f.ends_at>now()');
  });
  it('reprices a saved cart at quote/checkout after a sale ends or is disabled', async () => {
    const line = { ma_san_pham: 1, gia_ban: 30000, so_luong: 2, size: 'Nhỏ' };
    const query = jest.fn().mockResolvedValueOnce([{ ...product, effective_price: 45000 }]).mockResolvedValueOnce([]);
    const repriced = await repriceCartLines(query, [line]);
    expect(repriced[0].gia_ban).toBe(45000);
    expect(repriced[0].so_luong).toBe(2);
    expect(line.gia_ban).toBe(30000);
  });
  it('rejects unavailable items instead of using a stale cart price', async () => {
    await expect(repriceCartLines(jest.fn().mockResolvedValue([]), [{ ma_san_pham: 1, gia_ban: 30000 }])).rejects.toThrow();
  });
});
