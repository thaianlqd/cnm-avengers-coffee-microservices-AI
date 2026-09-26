import { ConflictException } from '@nestjs/common';
import { CartService } from './cart.service';

describe('CartService idempotent cart mutations', () => {
  it('persists one add and returns its stored result for the same operation id', async () => {
    const operations = new Map<string, any>();
    const manager = {
      getRepository: jest.fn(),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT request_hash, result')) {
          const row = operations.get(params[0]);
          return row ? [{ request_hash: row.request_hash, result: row.result }] : [];
        }
        if (sql.includes('INSERT INTO') && sql.includes('cart_mutation_operation')) {
          const [operationId, _userId, requestHash] = params;
          if (operations.has(operationId)) return [];
          operations.set(operationId, { request_hash: requestHash, result: null });
          return [{ operation_id: operationId }];
        }
        if (sql.includes('UPDATE') && sql.includes('cart_mutation_operation')) {
          const [operationId, result] = params;
          operations.get(operationId).result = JSON.parse(result);
          return [];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const dataSource: any = {
      query: jest.fn(), // CREATE TABLE IF NOT EXISTS
      transaction: (callback: any) => callback(manager),
    };
    const service = new CartService({} as any, dataSource, {} as any);
    const write = jest.fn(async () => ({ id: 701, ma_san_pham: 120, so_luong: 1 }));
    (service as any).themVaoGiỏNoIdempotency = write;

    const dto = {
      ma_nguoi_dung: 'customer-1', ma_san_pham: 120, so_luong: 1,
      size: 'Nhỏ', toppings: [], custom_attributes: {},
    };
    const first = await service.themVaoGiỏ(dto, 'conversation:add:0');
    const retry = await service.themVaoGiỏ(dto, 'conversation:add:0');

    expect(write).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ id: 701, already_processed: false });
    expect(retry).toMatchObject({ id: 701, already_processed: true });
  });

  it('rejects reusing an operation id for a different cart payload', async () => {
    const operations = new Map<string, any>();
    const manager = {
      getRepository: jest.fn(),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT request_hash, result')) {
          const row = operations.get(params[0]);
          return row ? [{ request_hash: row.request_hash, result: row.result }] : [];
        }
        if (sql.includes('INSERT INTO') && sql.includes('cart_mutation_operation')) {
          const [operationId, _userId, requestHash] = params;
          if (operations.has(operationId)) return [];
          operations.set(operationId, { request_hash: requestHash, result: null });
          return [{ operation_id: operationId }];
        }
        if (sql.includes('UPDATE') && sql.includes('cart_mutation_operation')) {
          operations.get(params[0]).result = JSON.parse(params[1]);
          return [];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const service = new CartService({} as any, {
      query: jest.fn(), transaction: (callback: any) => callback(manager),
    } as any, {} as any);
    (service as any).themVaoGiỏNoIdempotency = jest.fn(async () => ({ id: 701 }));

    await service.themVaoGiỏ({ ma_nguoi_dung: 'customer-1', ma_san_pham: 120, so_luong: 1 }, 'same-key');
    await expect(service.themVaoGiỏ(
      { ma_nguoi_dung: 'customer-1', ma_san_pham: 120, so_luong: 2 }, 'same-key',
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
