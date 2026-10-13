import { BadRequestException, ForbiddenException } from '@nestjs/common';

const portalRoles: Record<string, readonly string[]> = {
  admin: ['ADMIN'], manager: ['MANAGER'], staff: ['STAFF', 'KIOSK_STAFF', 'FRANCHISE_STAFF'],
  partner: ['FRANCHISEE'], accountant: ['ACCOUNTANT'],
};

export function assertLoginWorkspace(workspace: unknown, role: string) {
  // Existing mobile/customer clients do not send a workspace.
  if (workspace === undefined) return;
  if (typeof workspace !== 'string' || !Object.prototype.hasOwnProperty.call(portalRoles, workspace)) {
    throw new BadRequestException('Nhóm đăng nhập không hợp lệ');
  }
  if (!portalRoles[workspace].includes(role)) {
    throw new ForbiddenException('Tài khoản không thuộc nhóm đăng nhập đã chọn. Vui lòng chọn đúng tab.');
  }
}
