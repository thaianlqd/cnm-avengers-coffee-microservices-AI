import { ProductConfigurationValidator } from './product-configuration-validator.service';

describe('ProductConfigurationValidator', () => {
  const validator = new ProductConfigurationValidator();
  const queryable: any = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM menu.san_pham')) {
        return [{ ma_san_pham: 12, ten_san_pham: 'Matcha Latte', gia_ban: 39000, hinh_anh_url: '', trang_thai: true }];
      }
      return [
        { ten_thuoc_tinh: 'Kích thước', gia_tri: 'Vừa', phu_thu: 49000 },
        { ten_thuoc_tinh: 'Kích thước', gia_tri: 'Lớn', phu_thu: 59000 },
        { ten_thuoc_tinh: 'Topping', gia_tri: 'Trân châu', phu_thu: 5000 },
        { ten_thuoc_tinh: 'Loại sữa', gia_tri: 'Sữa yến mạch', phu_thu: 7000 },
      ];
    }),
  };

  it('uses the same canonical semantic groups without double-charging duplicated custom fields', async () => {
    const canonical = await validator.resolve(queryable, {
      ma_san_pham: 12, size: 'Vừa', toppings: ['Trân châu'], loai_sua: 'Sữa yến mạch',
    });
    const duplicateRepresentation = await validator.resolve(queryable, {
      ma_san_pham: 12, size: 'Vừa', toppings: ['Trân châu'], loai_sua: 'Sữa yến mạch',
      custom_attributes: {
        'Kích thước': 'Vừa', Topping: ['Trân châu'], 'Loại sữa': 'Sữa yến mạch',
      },
    });
    expect(canonical.unitPrice).toBe(61000);
    expect(duplicateRepresentation.unitPrice).toBe(canonical.unitPrice);
  });

  it('rejects an option in its own semantic group instead of matching another groups values', async () => {
    await expect(validator.resolve(queryable, {
      ma_san_pham: 12, size: 'Vừa', toppings: ['Sữa yến mạch'],
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUOTE_REQUIRED' }) });
  });
});
