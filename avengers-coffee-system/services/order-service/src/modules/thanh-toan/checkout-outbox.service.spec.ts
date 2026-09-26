import { CheckoutOutboxService } from './checkout-outbox.service';

describe('CheckoutOutboxService at-least-once replay', () => {
  it('reuses the stable event identity when publish succeeds but delivered update fails', async () => {
    const event = {
      event_id: 'event-1', event_key: 'order-created:order-1', event_type: 'ORDER_CREATED',
      payload: { orderId: 'order-1', userId: 'u1' }, attempts: 0,
      created_at: new Date('2026-09-27T00:00:00Z'),
    };
    let failCommit = true;
    const manager: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT event_id')) return [event];
        if (sql.includes('SET delivered_at') && failCommit) {
          failCommit = false;
          throw new Error('simulated DB failure after broker confirm');
        }
        return [];
      }),
    };
    const publish = jest.fn(async () => true);
    const dataSource: any = { transaction: async (cb: any) => cb(manager) };
    const service = new CheckoutOutboxService(dataSource, { publish } as any, {} as any);
    // The service catches delivery errors to schedule retry. A real DB
    // transaction rollback also preserves the event row on a commit failure.
    await service.deliverPending();
    await service.deliverPending();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.map(([, payload]) => payload)).toEqual([
      expect.objectContaining({ event_id: 'event-1', event_key: 'order-created:order-1', occurred_at: '2026-09-27T00:00:00.000Z' }),
      expect.objectContaining({ event_id: 'event-1', event_key: 'order-created:order-1', occurred_at: '2026-09-27T00:00:00.000Z' }),
    ]);
  });

  it('keeps failed Identity confirmation retryable and reconciles only after success', async () => {
    const event = {
      event_id: 'event-2', event_key: 'voucher-usage:order-1:SAVE:u1',
      event_type: 'VOUCHER_USAGE_CONFIRM',
      payload: { ma_don_hang: 'order-1', ma_khuyen_mai: 'SAVE', user_id: 'u1' }, attempts: 0,
    };
    const queries: string[] = [];
    const manager: any = { query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return sql.includes('SELECT event_id') ? [event] : [];
    }) };
    const service = new CheckoutOutboxService(
      { transaction: async (cb: any) => cb(manager) } as any, {} as any, {} as any,
    );
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true });
    global.fetch = fetchMock as any;
    try {
      await service.deliverPending();
      expect(queries.some((sql) => sql.includes('SET reconciled_at'))).toBe(false);
      expect(queries.some((sql) => sql.includes('SET attempts'))).toBe(true);
      queries.length = 0;
      await service.deliverPending();
      expect(queries.some((sql) => sql.includes('SET reconciled_at'))).toBe(true);
      expect(fetchMock.mock.calls[0][1].headers['x-idempotency-key']).toBe('event-2');
      expect(fetchMock.mock.calls[1][1].headers['x-idempotency-key']).toBe('event-2');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
