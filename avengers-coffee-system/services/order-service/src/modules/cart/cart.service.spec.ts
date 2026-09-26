import { ConflictException } from '@nestjs/common';
import { CartService } from './cart.service';

describe('CartService idempotent cart mutations', () => {
  const createMetadataAwareService = () => {
    const operations = new Map<string, any>();
    const metadata = new Map<string, any>();
    const rows: any[] = [];
    const repository = {
      find: jest.fn(async () => rows),
      create: jest.fn((row: any) => ({
        id: row.id || rows.length + 1,
        ...row,
      })),
      save: jest.fn(async (row: any) => {
        if (!rows.includes(row)) rows.push(row);
        return row;
      }),
    };
    const query = jest.fn(async (sql: string, params: any[] = []) => {
      const isUpdate = sql.trimStart().startsWith('UPDATE');
      if (
        sql.includes('CREATE TABLE IF NOT EXISTS') ||
        sql.includes('ALTER TABLE')
      )
        return [];
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
        rows.find((row) => row.id === options?.where?.id),
      ),
      find: jest.fn(async () => rows),
      save: jest.fn(async (row: any) => row),
      remove: jest.fn(async (row: any) => {
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
      }),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    const dataSource: any = {
      query,
      transaction: (callback: any) => callback(manager),
    };
    return {
      service: new CartService(repository as any, dataSource, {} as any),
      operations,
      metadata,
      rows,
      manager,
    };
  };

  it('persists one add and returns its stored result for the same operation id', async () => {
    const { service } = createMetadataAwareService();
    const write = jest.fn(async () => ({
      id: 701,
      ma_san_pham: 120,
      so_luong: 1,
    }));
    (service as any).themVaoGiỏNoIdempotency = write;

    const dto = {
      ma_nguoi_dung: 'customer-1',
      ma_san_pham: 120,
      so_luong: 1,
      size: 'Nhỏ',
      toppings: [],
      custom_attributes: {},
    };
    const first = await service.themVaoGiỏ(dto, 'conversation:add:0');
    const retry = await service.themVaoGiỏ(dto, 'conversation:add:0');

    expect(write).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      cart_id: 'user:customer-1',
      cart_version: 1,
      already_processed: false,
    });
    expect(retry).toMatchObject({
      cart_id: 'user:customer-1',
      cart_version: 1,
      already_processed: true,
    });
  });

  it('rejects reusing an operation id for a different cart payload', async () => {
    const { service } = createMetadataAwareService();
    (service as any).themVaoGiỏNoIdempotency = jest.fn(async () => ({
      id: 701,
    }));

    await service.themVaoGiỏ(
      { ma_nguoi_dung: 'customer-1', ma_san_pham: 120, so_luong: 1 },
      'same-key',
    );
    await expect(
      service.themVaoGiỏ(
        { ma_nguoi_dung: 'customer-1', ma_san_pham: 120, so_luong: 2 },
        'same-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a versioned canonical envelope and does not increment on reads', async () => {
    const { service, rows, metadata } = createMetadataAwareService();
    rows.push({
      id: 9,
      ma_nguoi_dung: 'customer-9',
      ma_san_pham: 120,
      ten_san_pham: 'Matcha Latte',
      so_luong: 2,
      gia_ban: 49000,
      size: 'Vừa',
      toppings: ['Trân châu'],
      luong_da: 'Ít đá',
      do_ngot: '50%',
      loai_sua: 'Sữa tươi',
      custom_attributes: { 'Độ ngọt': '50%' },
      hinh_anh_url: 'https://example.test/matcha.png',
    });

    const first = await service.layGiỏHàng('customer-9');
    const second = await service.layGiỏHàng('customer-9');

    expect(first).toMatchObject({
      cart_id: 'user:customer-9',
      cart_version: 0,
      user_id: 'customer-9',
      item_count: 2,
      subtotal: 98000,
    });
    expect(first.items[0]).toMatchObject({
      line_id: 9,
      product_id: 120,
      product_name: 'Matcha Latte',
      unit_price: 49000,
      line_total: 98000,
    });
    expect(first.items[0].configuration_signature).toMatch(/^[a-f0-9]{64}$/);
    expect(second.cart_version).toBe(0);
    expect(metadata.get('customer-9').cart_version).toBe(0);
  });

  it('makes SET quantity replay-safe and keeps the requested absolute quantity', async () => {
    const { service, rows, metadata } = createMetadataAwareService();
    rows.push({
      id: 21,
      ma_nguoi_dung: 'customer-set',
      ma_san_pham: 120,
      ten_san_pham: 'Cake',
      so_luong: 1,
      gia_ban: 29000,
      size: 'Nhỏ',
      toppings: [],
      custom_attributes: {},
    });
    (service as any).resolveAuthoritativeProduct = jest.fn(async () => ({
      productId: 120,
      productName: 'Cake',
      imageUrl: '',
      unitPrice: 29000,
    }));

    const first = await service.capNhatMucGio(
      21,
      { quantity: 2 },
      'customer-set',
      'set-cake-2',
    );
    const retry = await service.capNhatMucGio(
      21,
      { quantity: 2 },
      'customer-set',
      'set-cake-2',
    );

    expect(rows[0].so_luong).toBe(2);
    expect(first).toMatchObject({ cart_version: 1, already_processed: false });
    expect(retry).toMatchObject({ cart_version: 1, already_processed: true });
    expect(metadata.get('customer-set').cart_version).toBe(1);
    await expect(
      service.capNhatMucGio(21, { quantity: 3 }, 'customer-set', 'set-cake-2'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes only the requested line and replays without removing another option variant', async () => {
    const { service, rows, metadata } = createMetadataAwareService();
    rows.push(
      {
        id: 101,
        ma_nguoi_dung: 'customer-remove',
        ma_san_pham: 61,
        ten_san_pham: 'Matcha',
        so_luong: 1,
        gia_ban: 55000,
        size: 'Vừa',
        toppings: ['Foam'],
        custom_attributes: {},
      },
      {
        id: 102,
        ma_nguoi_dung: 'customer-remove',
        ma_san_pham: 61,
        ten_san_pham: 'Matcha',
        so_luong: 1,
        gia_ban: 55000,
        size: 'Vừa',
        toppings: ['Pearl'],
        custom_attributes: {},
      },
    );

    const first = await service.xoaKhoiGiỏ(
      101,
      'customer-remove',
      'remove-line-101',
    );
    const retry = await service.xoaKhoiGiỏ(
      101,
      'customer-remove',
      'remove-line-101',
    );

    expect(rows.map((row) => row.id)).toEqual([102]);
    expect(first).toMatchObject({ cart_version: 1, already_processed: false });
    expect(retry).toMatchObject({ cart_version: 1, already_processed: true });
    expect(metadata.get('customer-remove').cart_version).toBe(1);
  });

  it('edits one line, merges atomically with an identical option line, and replays safely', async () => {
    const { service, rows, metadata } = createMetadataAwareService();
    rows.push(
      {
        id: 301,
        ma_nguoi_dung: 'customer-edit',
        ma_san_pham: 61,
        ten_san_pham: 'Matcha',
        so_luong: 1,
        gia_ban: 55000,
        size: 'Vừa',
        toppings: ['Foam'],
        do_ngot: '50%',
        custom_attributes: {},
      },
      {
        id: 302,
        ma_nguoi_dung: 'customer-edit',
        ma_san_pham: 61,
        ten_san_pham: 'Matcha',
        so_luong: 1,
        gia_ban: 55000,
        size: 'Vừa',
        toppings: ['Pearl'],
        do_ngot: '100%',
        custom_attributes: {},
      },
    );
    (service as any).resolveAuthoritativeProduct = jest.fn(async () => ({
      productId: 61,
      productName: 'Matcha',
      imageUrl: '',
      unitPrice: 55000,
    }));

    const patch = { toppings: ['Pearl'], do_ngot: '100%' };
    const first = await service.capNhatMucGio(
      301,
      patch,
      'customer-edit',
      'edit-matcha-options',
    );
    const retry = await service.capNhatMucGio(
      301,
      patch,
      'customer-edit',
      'edit-matcha-options',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 302,
      so_luong: 2,
      do_ngot: '100%',
      toppings: ['Pearl'],
    });
    expect(first).toMatchObject({ cart_version: 1, already_processed: false });
    expect(retry).toMatchObject({ cart_version: 1, already_processed: true });
    expect(metadata.get('customer-edit').cart_version).toBe(1);
  });

  it('clears once, replays once, and leaves a newly empty cart at the same version', async () => {
    const { service, rows, metadata, manager } = createMetadataAwareService();
    rows.push(
      {
        id: 1,
        ma_nguoi_dung: 'customer-clear',
        ma_san_pham: 1,
        ten_san_pham: 'A',
        so_luong: 1,
        gia_ban: 10000,
      },
      {
        id: 2,
        ma_nguoi_dung: 'customer-clear',
        ma_san_pham: 2,
        ten_san_pham: 'B',
        so_luong: 1,
        gia_ban: 20000,
      },
      {
        id: 3,
        ma_nguoi_dung: 'customer-clear',
        ma_san_pham: 3,
        ten_san_pham: 'C',
        so_luong: 1,
        gia_ban: 30000,
      },
    );
    manager.delete.mockImplementation(async () => {
      const affected = rows.length;
      rows.splice(0, rows.length);
      return { affected };
    });

    const first = await service.xoaToanBoGio('customer-clear', 'clear-cart');
    const retry = await service.xoaToanBoGio('customer-clear', 'clear-cart');
    const newNoop = await service.xoaToanBoGio(
      'customer-clear',
      'clear-empty-cart',
    );

    expect(rows).toEqual([]);
    expect(first).toMatchObject({ cart_version: 1, already_processed: false });
    expect(retry).toMatchObject({ cart_version: 1, already_processed: true });
    expect(newNoop).toMatchObject({
      cart_version: 1,
      affected: 0,
      already_processed: false,
    });
    expect(metadata.get('customer-clear').cart_version).toBe(1);
  });

  it('uses canonical option signatures: sugar differs, topping order does not', () => {
    const { service } = createMetadataAwareService();
    const base = {
      ma_san_pham: 61,
      size: 'Vừa',
      luong_da: 'Ít đá',
      loai_sua: 'Sữa tươi',
      custom_attributes: {},
    };
    const fifty = { ...base, do_ngot: '50%', toppings: ['Foam', 'Pearl'] };
    const hundred = { ...base, do_ngot: '100%', toppings: ['Foam', 'Pearl'] };
    const reordered = { ...base, do_ngot: '50%', toppings: ['Pearl', 'Foam'] };
    const normalizedEquivalent = {
      ...base,
      do_ngot: '50%',
      toppings: ['pearl', 'foam'],
      custom_attributes: { 'Độ Ngọt': '50%' },
    };
    const withSameCustomAttributes = {
      ...base,
      do_ngot: '50%',
      toppings: ['Foam', 'Pearl'],
      custom_attributes: { 'độ ngọt': '50%' },
    };

    expect((service as any).configurationSignature(fifty)).not.toBe(
      (service as any).configurationSignature(hundred),
    );
    expect((service as any).configurationSignature(fifty)).toBe(
      (service as any).configurationSignature(reordered),
    );
    expect((service as any).configurationSignature(normalizedEquivalent)).toBe(
      (service as any).configurationSignature(withSameCustomAttributes),
    );
  });

  it('keeps different configurations as separate lines and merges the same configuration', async () => {
    const { service, rows } = createMetadataAwareService();
    (service as any).resolveAuthoritativeProduct = jest.fn(async () => ({
      productId: 61,
      productName: 'Matcha',
      imageUrl: '',
      unitPrice: 55000,
    }));
    const base = {
      ma_nguoi_dung: 'customer-options',
      ma_san_pham: 61,
      so_luong: 1,
      size: 'Vừa',
      luong_da: 'Ít đá',
      loai_sua: 'Sữa tươi',
      custom_attributes: {},
    };

    await (service as any).themVaoGiỏNoIdempotency({
      ...base,
      do_ngot: '50%',
      toppings: ['Foam', 'Pearl'],
    });
    await (service as any).themVaoGiỏNoIdempotency({
      ...base,
      do_ngot: '100%',
      toppings: ['Foam', 'Pearl'],
    });
    await (service as any).themVaoGiỏNoIdempotency({
      ...base,
      do_ngot: '50%',
      toppings: ['Pearl', 'Foam'],
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.so_luong).sort()).toEqual([1, 2]);
  });
});
