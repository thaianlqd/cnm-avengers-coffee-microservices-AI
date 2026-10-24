import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ShipperAccessGuard, SHIPPER_PUBLIC_KEY } from './shipper-access.guard';
import { hashShipperPassword, verifyShipperPassword } from './shipper-auth';

describe('shipper access boundary', () => {
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'driver-1', role: 'SHIPPER' }) };
  const reflector = { get: jest.fn().mockReturnValue(false) };
  const guard = new ShipperAccessGuard(jwt as any, reflector as any);
  const request = (method: string, path: string, query: any = {}, token = 'valid') => ({
    method, path, query, headers: { authorization: `Bearer ${token}` },
  });
  const ctx = (req: any) => ({ getHandler: () => ({}), switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
  beforeEach(() => { jwt.verifyAsync.mockResolvedValue({ sub: 'driver-1', role: 'SHIPPER' }); reflector.get.mockReturnValue(false); });
  it('allows login without bearer token', async () => {
    reflector.get.mockImplementation((key: string) => key === SHIPPER_PUBLIC_KEY);
    await expect(guard.canActivate(ctx(request('POST', '/shippers/login', {}, '')))).resolves.toBe(true);
  });
  it('rejects missing token and cross-driver access', async () => {
    await expect(guard.canActivate(ctx({ method: 'GET', path: '/shippers/driver-1/wallet', headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx(request('GET', '/shippers/driver-2/wallet')))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(request('GET', '/shippers/available-orders', { shipper_id: 'driver-2' })))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks a driver from using manager assignment endpoint', async () => {
    await expect(guard.canActivate(ctx(request('POST', '/shippers/driver-1/deliveries')))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(request('POST', '/shippers/assign-order')))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(request('GET', '/shippers/driver-1/deliveries')))).resolves.toBe(true);
  });
  it('manager assignment cannot impersonate driver acceptance',async()=>{
    jwt.verifyAsync.mockResolvedValue({sub:'manager',role:'MANAGER'});
    await expect(guard.canActivate(ctx(request('POST','/shippers/driver-1/accept/order-1')))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(request('POST','/shippers/driver-1/batch-orders/batch-1/accept')))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(request('POST','/shippers/assign-order')))).resolves.toBe(true);
  });
  it('hashes passwords and verifies only the matching secret', () => {
    const saved = hashShipperPassword('secret-pass');
    expect(saved).not.toContain('secret-pass');
    expect(verifyShipperPassword('secret-pass', saved)).toBe(true);
    expect(verifyShipperPassword('wrong', saved)).toBe(false);
  });
});
