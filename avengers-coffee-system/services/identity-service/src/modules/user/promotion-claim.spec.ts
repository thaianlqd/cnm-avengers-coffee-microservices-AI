import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { OrderVoucherClaim } from './order-voucher-claim.entity';

describe('promotion claim by order ID', () => {
  it('increments usage once across retries and rejects a different voucher', async () => {
    let usage: any = null;
    let count = 0;
    let pending: any = null;
    const manager: any = {
      createQueryBuilder: () => ({
        insert() { return this; }, into() { return this; }, values(value: any) { pending = value; return this; },
        orIgnore() { return this; }, returning() { return this; },
        async execute() {
          if (usage) return { raw: [] };
          usage = pending;
          return { raw: [{ id: 1 }] };
        },
      }),
      findOne: async (entity: any) => entity === OrderVoucherClaim ? usage : null,
      increment: async () => { count++; },
    };
    const service: any = Object.create(UserService.prototype);
    service.promotionUsageRepo = { manager: { transaction: async (write: any) => write(manager) } };
    const payload = { ma_khuyen_mai: 'SAVE20', user_id: 'user-1', ma_don_hang: 'order-1', so_tien_giam: 20000 };
    expect((await service.xacNhanSuDungKhuyenMai(payload)).already_processed).toBe(false);
    expect((await service.xacNhanSuDungKhuyenMai(payload)).already_processed).toBe(true);
    expect(count).toBe(1);
    await expect(service.xacNhanSuDungKhuyenMai({ ...payload, ma_khuyen_mai: 'OTHER' }))
      .rejects.toThrow(BadRequestException);
  });
});
