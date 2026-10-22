import { AppService } from './app.service';

describe('expanded menu categories', () => {
  it('keeps existing products under one parent after repeated startup', async () => {
    const rows: any[] = [
      { ma_danh_muc: 14, ten_danh_muc: 'Trà Sữa', cap_bac: 2, ma_danh_muc_cha: 102 },
      { ma_danh_muc: 2, ten_danh_muc: 'Bánh Mặn', cap_bac: 2, ma_danh_muc_cha: 104 },
    ];
    const categories: any = {
      findOne: jest.fn(async ({ where }: any) => rows.find(row => row.ten_danh_muc === where.ten_danh_muc && row.cap_bac === where.cap_bac) || null),
      create: (data: any) => ({ ...data }),
      save: jest.fn(async (row: any) => {
        if (!row.ma_danh_muc) row.ma_danh_muc = rows.length + 101;
        if (!rows.includes(row)) rows.push(row);
        return row;
      }),
    };
    const manager: any = { query: jest.fn(), getRepository: () => categories };
    const repo: any = { manager: { transaction: (fn: any) => fn(manager) } };
    const service = new AppService({} as any, repo, {} as any, {} as any);
    await service.ensureExpandedCategories();
    await service.ensureExpandedCategories();
    expect(rows.filter(row => row.cap_bac === 1)).toHaveLength(2);
    expect(rows.find(row => row.ten_danh_muc === 'Trà Sữa').ma_danh_muc_cha)
      .toBe(rows.find(row => row.ten_danh_muc === 'Trà sữa & Macchiato').ma_danh_muc);
    expect(rows.find(row => row.ten_danh_muc === 'Bánh Mặn').ma_danh_muc_cha)
      .toBe(rows.find(row => row.ten_danh_muc === 'Bánh mặn & ăn nhẹ').ma_danh_muc);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});
