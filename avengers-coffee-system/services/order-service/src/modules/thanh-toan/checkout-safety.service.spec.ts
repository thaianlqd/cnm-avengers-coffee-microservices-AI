import { CheckoutSafetyService } from './checkout-safety.service';

describe('CheckoutSafetyService strict confirmation', () => {
  it('returns the stored order for an idempotent replay before reading cart rows', async () => {
    const events: string[] = [];
    const manager: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('cart_metadata')) {
          events.push('cart-metadata');
          return sql.includes('SELECT')
            ? [{ user_id: 'u-1', cart_id: 'user:u-1', cart_version: 9 }]
            : [];
        }
        if (sql.includes('checkout_operation')) {
          events.push('checkout-operation');
          return [{ request_hash: expect.anything, result: { status: 'success', order_id: 'order-1', cart_version: 10 } }];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      }),
      getRepository: jest.fn(() => {
        events.push('cart-rows');
        return { find: jest.fn() };
      }),
    };
    // The exact request hash is calculated by the service. Return it after a
    // first dry call records no data would be brittle, so reflect the hash
    // from the SELECT parameter in this deterministic repository mock.
    manager.query.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('cart_metadata')) {
        events.push('cart-metadata');
        return sql.includes('SELECT')
          ? [{ user_id: 'u-1', cart_id: 'user:u-1', cart_version: 9 }]
          : [];
      }
      if (sql.includes('checkout_operation')) {
        events.push('checkout-operation');
        return [{ request_hash: undefined, result: { status: 'success', order_id: 'order-1', cart_version: 10 } }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const dataSource: any = {
      query: jest.fn(async () => []),
      transaction: async (callback: any) => callback(manager),
    };
    const service = new CheckoutSafetyService(dataSource, {} as any);
    // Seed the request hash from the private deterministic helper so this is
    // a replay of the exact same logical confirmation, not a bypass.
    const input: any = {
      quote_id: '11111111-1111-4111-8111-111111111111',
      action_id: '22222222-2222-4222-8222-222222222222', expected_cart_version: 9,
      phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG', delivery_mode: 'LAY_TAI_QUAN',
      branch_code: 'BR-1', dia_chi_giao_hang: 'Nhận tại: BR-1',
    };
    const hash = (service as any).hash({ user_id: 'u-1', ...input });
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('cart_metadata')) {
        events.push('cart-metadata');
        return sql.includes('SELECT')
          ? [{ user_id: 'u-1', cart_id: 'user:u-1', cart_version: 9 }]
          : [];
      }
      if (sql.includes('checkout_operation')) {
        events.push('checkout-operation');
        return [{ request_hash: hash, result: { status: 'success', order_id: 'order-1', cart_version: 10 } }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    await expect(service.confirmQuote('u-1', input, 'op-1')).resolves.toEqual({
      status: 'success', order_id: 'order-1', cart_version: 10, already_processed: true,
    });
    expect(events).toEqual(['cart-metadata', 'cart-metadata', 'checkout-operation']);
  });

  it('returns the winning transaction result when the operation insert loses a race', async () => {
    const events: string[] = [];
    const input: any = {
      quote_id: '11111111-1111-4111-8111-111111111111',
      action_id: '22222222-2222-4222-8222-222222222222', expected_cart_version: 9,
      phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG', delivery_mode: 'LAY_TAI_QUAN',
      branch_code: 'BR-1', dia_chi_giao_hang: 'Nhận tại: BR-1',
    };
    const dataSource: any = {
      query: jest.fn(async () => []),
      transaction: async (callback: any) => callback(manager),
    };
    const service = new CheckoutSafetyService(dataSource, {} as any);
    const hash = (service as any).hash({ user_id: 'u-1', ...input });
    let operationReads = 0;
    const manager: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('cart_metadata')) {
          events.push('cart-metadata');
          return sql.includes('SELECT')
            ? [{ user_id: 'u-1', cart_id: 'user:u-1', cart_version: 9 }]
            : [];
        }
        if (sql.includes('checkout_operation') && sql.includes('SELECT')) {
          events.push('operation-read');
          operationReads += 1;
          return operationReads === 1
            ? []
            : [{ request_hash: hash, result: { status: 'success', order_id: 'order-raced', cart_version: 10 } }];
        }
        if (sql.includes('checkout_operation') && sql.includes('INSERT')) {
          events.push('operation-insert-lost');
          return [];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      }),
      getRepository: jest.fn(() => {
        throw new Error('a replay must not read or mutate cart rows');
      }),
    };

    await expect(service.confirmQuote('u-1', input, 'op-race')).resolves.toEqual({
      status: 'success', order_id: 'order-raced', cart_version: 10, already_processed: true,
    });
    expect(events).toEqual([
      'cart-metadata', 'cart-metadata', 'operation-read', 'operation-insert-lost', 'operation-read',
    ]);
  });
});
