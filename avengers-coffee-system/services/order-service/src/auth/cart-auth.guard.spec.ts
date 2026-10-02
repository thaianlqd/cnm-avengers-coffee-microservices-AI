import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CartAuthGuard, assertAccountCheckoutOwner } from './cart-auth.guard';
import { CartController } from '../modules/cart/cart.controller';
const guest = 'anon-12345678-1234-4234-8234-123456789abc';
const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

describe('Guest cart authorization boundary', () => {
  const jwt = { verifyAsync: jest.fn() };
  const guard = new CartAuthGuard(jwt as unknown as JwtService);
  beforeEach(() => jwt.verifyAsync.mockReset());
  it('accepts a random guest capability without authenticating an account', async () => {
    const req: any = { headers: { 'x-guest-session-id': guest } };
    expect(await guard.canActivate(context(req))).toBe(true);
    expect(req.user).toEqual({ sub: guest, role: 'GUEST', username: 'guest' });
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
  it.each([undefined, 'anon-123', guest.slice(5), [guest]])('rejects a missing or malformed capability %s', async value => {
    await expect(guard.canActivate(context({ headers: { 'x-guest-session-id': value } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('never downgrades a rejected account JWT to guest access', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer invalid', 'x-guest-session-id': guest } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('binds guest reads and writes to the exact prefixed cart owner', async () => {
    const service: any = { layGiỏHàng: jest.fn(), themVaoGiỏ: jest.fn(), capNhatMucGio: jest.fn() };
    const controller = new CartController(service);
    const req = { user: { sub: guest, role: 'GUEST' } };
    await controller.getCart(guest, req);
    await controller.addToCart({ ma_nguoi_dung: guest }, undefined, req);
    await controller.updateItem('21', { quantity: 2 }, undefined, 'another-account', req);
    expect(service.capNhatMucGio.mock.calls[0][2]).toBe(guest);
    await expect(controller.getCart(guest.slice(5), req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.addToCart({ ma_nguoi_dung: 'another-account' }, undefined, req)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows base quote but blocks guest voucher and delivery quotes, including internal callers', async () => {
    const service: any = { quote: jest.fn() };
    const controller = new CartController(service);
    const req = { user: { sub: guest } };
    await controller.quoteCart(guest, {}, req);
    for (const body of [{ voucher_code: 'SAVE' }, { delivery_mode: 'LAY_TAI_QUAN' }]) {
      await expect(controller.quoteCart(guest, body, req)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.quoteCart(guest, body, { user: { username: 'internal-service' } })).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(service.quote).toHaveBeenCalledTimes(1);
  });
  it('derives merge target from JWT and requires both source proof and replay identity', async () => {
    const service: any = { mergeGuestCart: jest.fn() };
    const controller = new CartController(service);
    const body = { guest_session_id: guest };
    await expect(controller.mergeGuestCart(body, guest, 'op', { user: { sub: guest, role: 'GUEST' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.mergeGuestCart(body, guest, 'op', { user: { username: 'internal-service' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.mergeGuestCart(body, '', 'op', { user: { sub: 'account' } })).rejects.toBeInstanceOf(BadRequestException);
    await controller.mergeGuestCart(body, guest, 'op', { user: { sub: 'account' } });
    expect(service.mergeGuestCart).toHaveBeenCalledWith(guest, 'account', 'op');
  });
});


describe('Account-only order and voucher owners', () => {
  it.each(['anon-12345678-1234-4234-8234-123456789abc', '', 'GUEST', 'anonymous'])('rejects guest target %s even for internal JWT', target => {
    expect(() => assertAccountCheckoutOwner({ username: 'internal-service' }, target)).toThrow(ForbiddenException);
  });
  it('requires exact account ownership, permits internal verified account actions', () => {
    expect(() => assertAccountCheckoutOwner({ sub: 'a' }, 'b')).toThrow(ForbiddenException);
    expect(() => assertAccountCheckoutOwner({ sub: 'a' }, 'a')).not.toThrow();
    expect(() => assertAccountCheckoutOwner({ username: 'internal-service' }, 'a')).not.toThrow();
  });
});
