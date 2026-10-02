import { ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

export const isGuestCartId = (value: unknown): value is string =>
  typeof value === 'string' && /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** A random guest capability grants access to that cart only, never checkout. */
@Injectable()
export class CartAuthGuard extends JwtAuthGuard {
  constructor(jwtService: JwtService) { super(jwtService); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (request.headers.authorization) return super.canActivate(context);
    const guestId = request.headers['x-guest-session-id'];
    if (!isGuestCartId(guestId)) throw new UnauthorizedException('Thiếu phiên khách hoặc access token');
    request.user = { sub: guestId, role: 'GUEST', username: 'guest' };
    return true;
  }
}

/** Cart capabilities never authorize voucher eligibility or order creation. */
export function assertAccountCheckoutOwner(user: any, userId: string) {
  if (!userId || isGuestCartId(userId) || ['guest', 'anonymous'].includes(String(userId).toLowerCase())) {
    throw new ForbiddenException({ code: 'LOGIN_REQUIRED', message: 'Vui lòng đăng nhập để dùng voucher hoặc đặt hàng' });
  }
  if (user?.username !== 'internal-service' && String(user?.sub || '') !== String(userId)) {
    throw new ForbiddenException('Bạn không có quyền dùng giỏ của tài khoản này');
  }
}
