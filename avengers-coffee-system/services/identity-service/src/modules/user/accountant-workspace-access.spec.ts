import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { UserController } from './user.controller';
import { FranchiseController } from '../franchise/franchise.controller';

describe('Franchise manager workspace access',()=>{
  const accountant={sub:'accountant-1',role:'ACCOUNTANT',username:'accountant_demo',email:null,branchCode:null,branchName:null};
  const guard=new RolesGuard(new Reflector());
  const context=(handler:any,controller:any)=>({getHandler:()=>handler,getClass:()=>controller,switchToHttp:()=>({getRequest:()=>({user:accountant})})}) as any;
  it('can read audit history while administrative sanctions retain their existing role restriction',()=>{
    expect(guard.canActivate(context(FranchiseController.prototype.getAuditLogs,FranchiseController))).toBe(true);
    expect(()=>guard.canActivate(context(FranchiseController.prototype.lapBienBan,FranchiseController))).toThrow(ForbiddenException);
  });
  it('can read and edit its own profile and change its password, without editing another user',async()=>{
    const service={capNhatThongTinCaNhan:jest.fn().mockResolvedValue({}),layThongTinCaNhan:jest.fn()};
    const controller=new UserController(service as any);
    for(const handler of [controller.layThongTinCaNhan,controller.capNhatThongTinCaNhan,controller.doiMatKhau])expect(guard.canActivate(context(handler,UserController))).toBe(true);
    await controller.capNhatThongTinCaNhan('accountant-1',accountant,{hoTen:'Quản lý mới'});
    expect(service.capNhatThongTinCaNhan).toHaveBeenCalledWith('accountant-1',{hoTen:'Quản lý mới'});
    await expect(controller.capNhatThongTinCaNhan('another-user',accountant,{hoTen:'Sai phạm vi'})).rejects.toThrow(ForbiddenException);
  });
});
