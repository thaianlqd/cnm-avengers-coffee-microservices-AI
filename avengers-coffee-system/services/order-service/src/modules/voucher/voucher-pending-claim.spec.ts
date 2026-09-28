import { BadRequestException } from '@nestjs/common';
import { VoucherService } from './voucher.service';

describe('voucher validation while a paid wallet claim is pending', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('blocks reuse until the durable claim reaches Identity', async () => {
    const service: any = Object.create(VoucherService.prototype);
    service.voucherRepo = {
      manager: { query: jest.fn(async () => [{ exists: 1 }]) },
      findOne: jest.fn(),
    };
    await expect(service.kiemTraVoucher('save20', 100000, 'customer-1'))
      .rejects.toThrow(BadRequestException);
    expect(service.voucherRepo.findOne).not.toHaveBeenCalled();
    expect(service.voucherRepo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'PENDING'"), ['customer-1', 'SAVE20'],
    );
  });
  it('fails closed when per-user usage cannot be verified', async () => {
    const service: any = Object.create(VoucherService.prototype);
    service.voucherRepo = {
      manager: { query: jest.fn(async () => []) },
      findOne: jest.fn(async () => ({ ma_voucher: 'SAVE20', loai_phan_phoi: 'PUBLIC',
        ngay_bat_dau: null, han_su_dung: null, tong_luot_dung: null,
        luot_da_dung: 0, gioi_han_moi_nguoi: 1 })),
    };
    global.fetch = jest.fn(async () => ({ ok: false })) as any;
    await expect(service.kiemTraVoucher('SAVE20', 100000, 'customer-1'))
      .rejects.toThrow('Chua the xac minh luot su dung voucher');
  });
});
