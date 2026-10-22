import { GiftCardService } from './gift-card.service';
import { GiftCard } from './entities/gift-card.entity';
import { GiftCardController } from './gift-card.controller';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

const code = 'ABCD-EFGH-IJKL-MNOP';
function setup(overrides: Record<string, any> = {}) {
  let card: any = { id: 'card', code, value: 100000, current_balance: 100000, status: 'ACTIVE', expires_at: new Date(Date.now() + 86400000), ...overrides };
  let balance = 50000;
  const ledger: any[] = [];
  let queue = Promise.resolve();
  const repo: any = { findOne: jest.fn(async () => card ? { ...card } : null), save: jest.fn(async next => { card = { ...next }; return next; }), create: jest.fn(value => value) };
  const manager: any = { getRepository: jest.fn(entity => { expect(entity).toBe(GiftCard); return repo; }) };
  manager.transaction = operation => {
    const run = queue.then(async () => {
      const previous = card && { ...card }, priorBalance = balance, count = ledger.length;
      try { return await operation(manager); } catch (error) { card = previous; balance = priorBalance; ledger.splice(count); throw error; }
    });
    queue = run.catch(() => undefined);
    return run;
  };
  repo.manager = manager;
  const wallet: any = { creditGiftCard: jest.fn(async (customer, amount, reference, tx) => {
    expect(tx).toBe(manager); balance += amount; ledger.push({ customer, amount, reference });
    return { wallet_balance: balance, transaction_id: 'ledger-entry' };
  }) };
  const service = new GiftCardService(repo, {} as any, wallet, {} as any);
  return { service, repo, wallet, ledger, get card() { return card; }, get balance() { return balance; } };
}
describe('Gift-card redemption transaction', () => {
  it('serializes concurrent redemption, credits the full value exactly once, and records the code', async () => {
    const state = setup();
    const results = await Promise.allSettled([1, 2].map(() => state.service.redeemGiftCard({ code: 'abcdefghijklmnop', customer_id: 'customer' })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(state.balance).toBe(150000); expect(state.ledger).toEqual([{ customer: 'customer', amount: 100000, reference: code }]);
    expect(state.card).toMatchObject({ status: 'REDEEMED', current_balance: 0, redeemed_by: 'customer' });
    expect(state.repo.findOne).toHaveBeenCalledWith({ where: { code }, lock: { mode: 'pessimistic_write' } });
  });
  it.each([
    [{ expires_at: new Date(0) }, 'GIFT_CARD_EXPIRED'], [{ status: 'REDEEMED' }, 'GIFT_CARD_USED'],
    [{ redeemed_by: 'another-customer' }, 'GIFT_CARD_USED'], [{ status: 'DISABLED' }, 'GIFT_CARD_INVALID'],
  ])('does not touch a wallet for an unusable card: %j', async (overrides, expected) => {
    const state = setup(overrides);
    try { await state.service.redeemGiftCard({ code, customer_id: 'customer' }); throw new Error('Expected rejection'); }
    catch (error) { expect(error.getResponse().code).toBe(expected); }
    expect(state.wallet.creditGiftCard).not.toHaveBeenCalled(); expect(state.balance).toBe(50000);
  });
  it('rolls back card consumption and wallet credit if the database write fails', async () => {
    const state = setup(); state.repo.save.mockRejectedValue(new Error('database unavailable'));
    await expect(state.service.redeemGiftCard({ code, customer_id: 'customer' })).rejects.toThrow('database unavailable');
    expect(state.balance).toBe(50000); expect(state.ledger).toHaveLength(0); expect(state.card.status).toBe('ACTIVE');
  });
  it('previews only value, balance and expiry without personal information or writes', async () => {
    const state = setup({ receiver_email: 'private@example.com', sender_name: 'Private Sender' });
    const result = await state.service.validateGiftCard(code, 'customer');
    expect(result.data).not.toHaveProperty('receiver_email'); expect(result.data).not.toHaveProperty('sender_name');
    expect(state.repo.save).not.toHaveBeenCalled();
  });
  it.each(['purchaseGiftCard', 'validateGiftCard', 'redeemGiftCard', 'getMyGiftCards', 'transferGiftCardBalance', 'getGiftCardDetails'])('requires JWT for %s', method => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GiftCardController.prototype[method])).toContain(JwtAuthGuard);
  });
});
