import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('per-kiosk selling availability', () => {
  const setup = () => {
    const builder: any = {};
    for (const key of ['insert', 'into', 'values', 'orUpdate', 'returning']) builder[key] = jest.fn(() => builder);
    builder.execute = jest.fn(async () => ({ raw: [{ co_so_ma: 'KSK-001', ma_san_pham: 7, dang_kinh_doanh: false, so_luong_ton: 13 }] }));
    const repo: any = { createQueryBuilder: jest.fn(() => builder) };
    return { service: new InventoryService(repo, {} as any), builder, repo };
  };
  it('updates only the selling flag, preserving a concurrent stock change and scoping the conflict to the kiosk', async () => {
    const { service, builder } = setup();
    const result = await service.updateSelling(7, { branch_code: ' ksk-001 ', dang_kinh_doanh: false });
    expect(builder.values).toHaveBeenCalledWith({ co_so_ma: 'KSK-001', ma_san_pham: 7, dang_kinh_doanh: false });
    expect(builder.orUpdate).toHaveBeenCalledWith(['dang_kinh_doanh'], ['co_so_ma', 'ma_san_pham']);
    expect(result.so_luong_ton).toBe(13);
    expect(builder.execute).toHaveBeenCalledTimes(1);
  });
  it.each([[0, { branch_code: 'KSK-001', dang_kinh_doanh: false }], [7, { branch_code: '', dang_kinh_doanh: true }], [7, { branch_code: 'KSK-001', dang_kinh_doanh: 'false' }]])('rejects missing scope or invalid flag before writing', async (id, payload) => {
    const { service, repo } = setup();
    await expect(service.updateSelling(id as number, payload as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
