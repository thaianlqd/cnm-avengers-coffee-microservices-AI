import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
describe('Transactional guest cart handoff', () => {
  const createMetadataAwareService = () => {
    const operations = new Map<string, any>();
    const metadata = new Map<string, any>();
    const rows: any[] = [];
    const events: string[] = [];
    const repository = {
      find: jest.fn(async (options: any) => {
        events.push('cart-read');
        return rows.filter(row => Object.entries(options?.where || {}).every(([key, val]) => row[key] === val));
      }),
      delete: jest.fn(async (where: any) => {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].ma_nguoi_dung === where.ma_nguoi_dung) rows.splice(i, 1);
      }),
      create: jest.fn((row: any) => ({
        id: row.id || rows.length + 1,
        ...row,
      })),
      save: jest.fn(async (row: any) => {
        events.push('cart-save');
        if (!rows.includes(row)) rows.push(row);
        return row;
      }),
    };
    const query = jest.fn(async (sql: string, params: any[] = []) => {
      const isUpdate = sql.trimStart().startsWith('UPDATE');
      if (sql.includes('to_regclass')) {
        return [{
          cart_metadata: 'orders.cart_metadata',
          cart_mutation_operation: 'orders.cart_mutation_operation',
        }];
      }
      if (sql.includes('SELECT request_hash, result')) {
        const row = operations.get(params[0]);
        return row
          ? [{ request_hash: row.request_hash, result: row.result }]
          : [];
      }
      if (
        sql.includes('INSERT INTO') &&
        sql.includes('cart_mutation_operation')
      ) {
        const [
          operationId,
          _userId,
          operationTypeOrRequestHash,
          explicitRequestHash,
        ] = params;
        const requestHash = explicitRequestHash || operationTypeOrRequestHash;
        if (operations.has(operationId)) return [];
        operations.set(operationId, {
          request_hash: requestHash,
          result: null,
        });
        return [{ operation_id: operationId }];
      }
      if (isUpdate && sql.includes('cart_mutation_operation')) {
        const [operationId, result] = params;
        operations.get(operationId).result = JSON.parse(result);
        return [];
      }
      if (sql.includes('cart_metadata')) {
        const userId = params[0];
        if (sql.includes('INSERT INTO')) {
          if (!metadata.has(userId))
            metadata.set(userId, {
              user_id: userId,
              cart_id: params[1],
              cart_version: 0,
            });
          return [];
        }
        if (isUpdate) {
          const current = metadata.get(userId);
          current.cart_version += 1;
          return [current];
        }
        return [metadata.get(userId)];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const manager: any = {
      getRepository: jest.fn(() => repository),
      query,
      findOne: jest.fn(async (_entity: any, options: any) =>
        {
          events.push('cart-read');
          return rows.find((row) => row.id === options?.where?.id);
        },
      ),
      find: jest.fn(async () => {
        events.push('cart-read');
        return rows;
      }),
      save: jest.fn(async (row: any) => row),
      remove: jest.fn(async (row: any) => {
        events.push('cart-remove');
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
      }),
      delete: jest.fn(async () => {
        events.push('cart-delete');
        return { affected: 0 };
      }),
    };
    const cartLockTails = new Map<string, Promise<void>>();
    const dataSource: any = {
      query,
      transaction: async (callback: any) => {
        const releases = new Map<string, () => void>();
        const originalRows = structuredClone(rows);
        const originalMetadata = structuredClone(metadata);
        const originalOperations = structuredClone(operations);
        const transactionManager = {
          ...manager,
          query: async (sql: string, params: any[] = []) => {
            if (
              sql.includes('cart_metadata') &&
              sql.includes('FOR UPDATE') &&
              !releases.has(String(params[0]))
            ) {
              const userId = String(params[0]);
              const previous = cartLockTails.get(userId) || Promise.resolve();
              let releaseCurrent!: () => void;
              const current = new Promise<void>((resolve) => {
                releaseCurrent = resolve;
              });
              cartLockTails.set(userId, previous.then(() => current));
              await previous;
              events.push(`cart-lock:${userId}`);
              releases.set(userId, releaseCurrent);
            }
            return query(sql, params);
          },
        };
        try {
          return await callback(transactionManager);
        } catch (error) {
          rows.splice(0, rows.length, ...originalRows);
          metadata.clear(); for (const [key, value] of originalMetadata) metadata.set(key, value);
          operations.clear(); for (const [key, value] of originalOperations) operations.set(key, value);
          throw error;
        } finally {
          for (const release of releases.values()) release();
        }
      },
    };
    return {
      service: new CartService(repository as any, dataSource, {} as any),
      operations,
      metadata,
      rows,
      manager,
      events,
      query,
    };
  };


  const guest = 'anon-12345678-1234-4234-8234-123456789abc';
  const line = (id: number, owner: string, quantity: number, toppings: string[] = []) => ({
    id, ma_nguoi_dung: owner, ma_san_pham: 70, ten_san_pham: 'Old name', gia_ban: 1,
    so_luong: quantity, size: 'Vừa', toppings, luong_da: 'Ít đá', do_ngot: 'Bình thường',
    loai_sua: 'Sữa tươi', custom_attributes: { addOn: ['Alpha'] },
  });
  const setup = () => {
    const fixture = createMetadataAwareService();
    (fixture.service as any).resolveAuthoritativeProduct = jest.fn(async () => ({ productId: 70, productName: 'Canonical Matcha', imageUrl: 'canonical.png', unitPrice: 65000 }));
    return fixture;
  };
  it('preserves both carts and full configurations, reprices and merges only identical lines', async () => {
    const { service, rows } = setup();
    rows.push(line(1, 'account', 2), line(2, guest, 3), line(3, guest, 1, ['Pearl']), { ...line(4, 'account', 1), ma_san_pham: 99 });
    const result = await service.mergeGuestCart(guest, 'account', 'handoff-1');
    expect(rows.filter(row => row.ma_nguoi_dung === guest)).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.items.find(row => row.id === 1)).toMatchObject({ quantity: 5, unit_price: 65000 });
    expect(result.items.find(row => row.toppings.length)).toMatchObject({ quantity: 1, toppings: ['Pearl'], luong_da: 'Ít đá', do_ngot: 'Bình thường', loai_sua: 'Sữa tươi', custom_attributes: { addOn: ['Alpha'] } });
    expect(result.items.find(row => row.product_id === 99)).toBeDefined();
    expect(result.moved_quantity).toBe(4);
    const replay = await service.mergeGuestCart(guest, 'account', 'handoff-1');
    expect(replay.already_processed).toBe(true);
    expect(rows.find(row => row.id === 1).so_luong).toBe(5);
  });
  it('does not touch account cart or bump its version when guest cart is empty', async () => {
    const { service, rows } = setup(); rows.push(line(1, 'account', 2));
    const result = await service.mergeGuestCart(guest, 'account', 'empty');
    expect(result.cart_version).toBe(0); expect(result.affected).toBe(0);
    expect(result.items[0].quantity).toBe(2);
  });
  it('rolls back the entire handoff if a later guest product cannot be priced', async () => {
    const { service, rows } = setup(); rows.push(line(1, 'account', 2), line(2, guest, 3), line(3, guest, 1, ['Pearl']));
    const before = structuredClone(rows);
    (service as any).resolveAuthoritativeProduct.mockImplementationOnce(async () => ({ productId: 70, productName: 'Canonical', imageUrl: '', unitPrice: 65000 })).mockRejectedValueOnce(new Error('Unavailable menu product'));
    await expect(service.mergeGuestCart(guest, 'account', 'failure')).rejects.toThrow('Unavailable menu product');
    expect(rows).toEqual(before);
  });
  it.each(['anon-weak', '12345678-1234-4234-8234-123456789abc', 'account'])('rejects invalid source %s', async source => {
    const { service } = setup();
    await expect(service.mergeGuestCart(source, 'account', 'op')).rejects.toBeInstanceOf(BadRequestException);
  });
});
