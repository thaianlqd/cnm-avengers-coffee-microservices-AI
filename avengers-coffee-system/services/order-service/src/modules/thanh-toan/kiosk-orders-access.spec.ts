import { ForbiddenException } from '@nestjs/common';
import { AppController } from '../../app.controller';

// app.controller is two levels above modules/thanh-toan.
describe('Employee kiosk order history and refund scope',()=>{
  const service={layDanhSachDonHangChoStaff:jest.fn().mockReturnValue({orders:[]}),kiemTraHopLeHoanHuyPos:jest.fn(),hoanHuyDonHangPos:jest.fn()};
  const controller=new AppController({} as any,service as any,{} as any,{} as any,{} as any,{} as any,{} as any);
  const staff={sub:'staff-1',role:'FRANCHISE_STAFF',username:'an',email:null,branchCode:'KSK-052',branchName:'Kiosk 52'};
  beforeEach(()=>jest.clearAllMocks());
  it.each(['FRANCHISE_STAFF','KIOSK_STAFF'])('uses the assigned kiosk for %s history',role=>{
    controller.getStaffOrders({...staff,role});
    expect(service.layDanhSachDonHangChoStaff).toHaveBeenCalledWith(expect.objectContaining({branchCode:'KSK-052'}),false);
    expect(()=>controller.getStaffOrders({...staff,role},undefined,undefined,undefined,undefined,'KSK-OTHER')).toThrow(ForbiddenException);
  });
  it('rejects a different kiosk for eligibility and the refund mutation before calling the service',()=>{
    expect(()=>controller.checkRefundEligibility('order-1',staff,'KSK-OTHER')).toThrow(ForbiddenException);
    expect(()=>controller.refundVoidStaffOrder('order-1',{reason:'Nhập nhầm món',branch_code:'KSK-OTHER'},staff)).toThrow(ForbiddenException);
    expect(service.hoanHuyDonHangPos).not.toHaveBeenCalled();
  });
  it('keeps the authenticated cashier and kiosk on refund',()=>{
    controller.refundVoidStaffOrder('order-1',{reason:'Nhập nhầm món'},staff);
    expect(service.hoanHuyDonHangPos).toHaveBeenCalledWith('order-1',expect.objectContaining({branch_code:'KSK-052',staff_username:'an',session_scope:'FRANCHISE_KIOSK'}));
  });
});
