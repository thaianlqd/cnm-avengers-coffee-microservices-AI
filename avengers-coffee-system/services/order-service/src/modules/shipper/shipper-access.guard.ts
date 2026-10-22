import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

export const SHIPPER_PUBLIC_KEY = 'shipperPublic';
const MANAGEMENT_ROLES = new Set(['ADMIN', 'MANAGER']);

@Injectable()
export class ShipperAccessGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(SHIPPER_PUBLIC_KEY, context.getHandler())) return true;
    const req = context.switchToHttp().getRequest();
    const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!match) throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục');
    let user: { sub?: string; role?: string; branchCode?: string };
    try { user = await this.jwt.verifyAsync(match[1]); }
    catch { throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn'); }
    const role = String(user.role || '').toUpperCase();
    if (!user.sub || !role) throw new UnauthorizedException('Tài khoản không hợp lệ');
    req.user = user;
    const path = String(req.path || '').replace(/^\/shippers\/?/, '');
    const method = String(req.method || '').toUpperCase();
    if (MANAGEMENT_ROLES.has(role)) return true;
    if (role === 'STAFF') {
      const branch = String(user.branchCode || '').trim().toUpperCase().replace(/-/g, '_');
      if (!branch) throw new ForbiddenException('Nhân viên chưa được phân chi nhánh');
      const requestedBranch = String(req.query?.branch_code || '').trim().toUpperCase().replace(/-/g, '_');
      if (method === 'GET' && ['', 'all', 'cod-remits'].includes(path) && requestedBranch === branch) return true;
      if (method === 'POST' && (/^orders\/[^/]+\/mark-ready$/.test(path) || path === 'assign-order')) return true;
      throw new ForbiddenException('Nhân viên chỉ được xử lý đơn của chi nhánh mình');
    }
    if (role !== 'SHIPPER') throw new ForbiddenException('Tài khoản không có quyền truy cập giao hàng');
    const ownPath = path.startsWith(`${user.sub}/`) && !(method === 'POST' && path === `${user.sub}/deliveries`);
    const publicPool = path === 'available-orders' && method === 'GET' && String(req.query?.shipper_id || '') === user.sub;
    if (ownPath || publicPool) return true;
    throw new ForbiddenException('Không thể truy cập dữ liệu của tài xế khác');
  }
}
