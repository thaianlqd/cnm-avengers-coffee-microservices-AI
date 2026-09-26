import { UserService } from './user.service';

describe('Identity promotion usage confirmation', () => {
  function serviceWithDatabase(promotionExists: boolean) {
    const businessKeys = new Set<string>();
    let counter = 0;
    let queue = Promise.resolve();
    const manager = {
      query: jest.fn(async (sql: string, args: any[]) => {
        if (sql.includes('SELECT ma_khuyen_mai')) return promotionExists ? [{ ma_khuyen_mai: args[0] }] : [];
        if (sql.includes('INSERT INTO') && sql.includes('external_voucher_usage')) {
          const key = args.slice(0, 3).join(':');
          if (businessKeys.has(key)) return [];
          businessKeys.add(key);
          return [{ order_id: args[2] }];
        }
        if (sql.includes('INSERT INTO') && sql.includes('khuyen_mai_su_dung')) {
          const key = args.slice(0, 3).join(':');
          if (businessKeys.has(key)) return [];
          businessKeys.add(key);
          return [{ id: businessKeys.size }];
        }
        if (sql.includes('UPDATE') && sql.includes('khuyen_mai')) {
          counter += 1;
          return [{ so_luong_da_dung: counter }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => Promise<any>) => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try { return await callback(manager); } finally { release(); }
      }),
    };
    const service = Object.create(UserService.prototype) as UserService;
    (service as any).dataSource = dataSource;
    return { service, manager, getCounter: () => counter };
  }

  it('serializes concurrent duplicate promotion confirmations and increments once', async () => {
    const { service, getCounter, manager } = serviceWithDatabase(true);
    const payload = { ma_khuyen_mai: 'SAVE', user_id: 'u1', ma_don_hang: 'o1', so_tien_giam: 1000 };
    const results = await Promise.all(Array.from({ length: 8 }, () => service.xacNhanSuDungKhuyenMai(payload)));
    expect(results.filter((result) => !result.already_processed)).toHaveLength(1);
    expect(getCounter()).toBe(1);
    expect(manager.query.mock.calls.filter(([sql]) => String(sql).trim().startsWith('UPDATE'))).toHaveLength(1);
  });

  it('deduplicates public vouchers absent from the Identity promotion table', async () => {
    const { service, getCounter } = serviceWithDatabase(false);
    const payload = { ma_khuyen_mai: 'PUBLIC', user_id: 'u1', ma_don_hang: 'o1' };
    expect((await service.xacNhanSuDungKhuyenMai(payload)).already_processed).toBe(false);
    expect((await service.xacNhanSuDungKhuyenMai(payload)).already_processed).toBe(true);
    expect(getCounter()).toBe(0);
  });

  it('requires the durable voucher/user/order business key', async () => {
    const { service } = serviceWithDatabase(true);
    await expect(service.xacNhanSuDungKhuyenMai({ ma_khuyen_mai: 'SAVE', user_id: 'u1' })).rejects.toThrow();
  });
});
