import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { UserController } from './user.controller';

describe('Kiosk employee personal profile', () => {
  const employee = { sub:'staff-1',role:'FRANCHISE_STAFF',username:'an',email:null,branchCode:'KSK-1',branchName:'Kiosk 1' };
  const service = { capNhatThongTinCaNhan:jest.fn().mockResolvedValue({user:{ho_ten:'An'}}),layThongTinCaNhan:jest.fn() };
  const controller = new UserController(service as any);
  beforeEach(() => jest.clearAllMocks());
  it.each(['KIOSK_STAFF','FRANCHISE_STAFF'])('permits %s only on their own profile and password endpoints', async role => {
    const guard = new RolesGuard(new Reflector());
    for (const handler of [controller.layThongTinCaNhan,controller.capNhatThongTinCaNhan,controller.doiMatKhau]) {
      const context = {getHandler:()=>handler,getClass:()=>UserController,switchToHttp:()=>({getRequest:()=>({user:{...employee,role}})})};
      expect(guard.canActivate(context as any)).toBe(true);
    }
    await expect(controller.capNhatThongTinCaNhan('another-user',{...employee,role},{hoTen:'An'})).rejects.toThrow(ForbiddenException);
    expect(service.capNhatThongTinCaNhan).not.toHaveBeenCalled();
  });
  it('allows only name and phone, even if additional account fields are submitted', async () => {
    await controller.capNhatThongTinCaNhan('staff-1',employee,{hoTen:' An mới ',soDienThoai:'+84 901 234 567',email:'changed@example.vn',avatarUrl:'https://example.vn/avatar.png',vai_tro:'ADMIN',co_so_ma:'OTHER'} as any);
    expect(service.capNhatThongTinCaNhan).toHaveBeenCalledWith('staff-1',{hoTen:'An mới',soDienThoai:'84901234567'});
  });
  it.each([{hoTen:' '},{hoTen:42},{soDienThoai:'0999999'},{soDienThoai:'hello0901234567'}])('rejects malformed contacts before persistence: %j', async body => {
    await expect(controller.capNhatThongTinCaNhan('staff-1',employee,body as any)).rejects.toThrow(BadRequestException);
    expect(service.capNhatThongTinCaNhan).not.toHaveBeenCalled();
  });
  it('retains existing account editing behavior for other roles', async () => {
    const body = {hoTen:'Khách',email:'customer@example.vn'};
    await controller.capNhatThongTinCaNhan('staff-1',{...employee,role:'CUSTOMER'},body);
    expect(service.capNhatThongTinCaNhan).toHaveBeenCalledWith('staff-1',body);
  });
});
