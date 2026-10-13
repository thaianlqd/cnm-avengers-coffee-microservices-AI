import {AppController} from './app.controller';
import {ThanhToanService} from './modules/thanh-toan/thanh-toan.service';
test.each(['STAFF','MANAGER','FRANCHISEE','FRANCHISE_STAFF','ACCOUNTANT'])('%s cannot request ALL orders',role=>{
  const controller=Object.create(AppController.prototype) as any;
  controller.thanhToanService={layDanhSachDonHangChoStaff:jest.fn()};
  expect(()=>controller.getStaffOrders({role},undefined,undefined,undefined,undefined,'ALL')).toThrow('Chỉ ADMIN');
  expect(controller.thanhToanService.layDanhSachDonHangChoStaff).not.toHaveBeenCalled();
});
test('ADMIN is granted ALL explicitly; ordinary branch calls are not',()=>{
  const controller=Object.create(AppController.prototype) as any;
  controller.thanhToanService={layDanhSachDonHangChoStaff:jest.fn()};
  controller.getStaffOrders({role:'ADMIN'},undefined,undefined,undefined,undefined,'ALL');
  expect(controller.thanhToanService.layDanhSachDonHangChoStaff).toHaveBeenLastCalledWith(expect.objectContaining({branchCode:'ALL'}),true);
  controller.getStaffOrders({role:'MANAGER'},undefined,undefined,undefined,undefined,'BRANCH');
  expect(controller.thanhToanService.layDanhSachDonHangChoStaff).toHaveBeenLastCalledWith(expect.objectContaining({branchCode:'BRANCH'}),false);
});
test('service rejects ALL before reading shared cache when not authorised',async()=>{
  const service=Object.create(ThanhToanService.prototype) as any;
  service.redisCacheService={getJson:jest.fn()};
  await expect(service.layDanhSachDonHangChoStaff({branchCode:'ALL'})).rejects.toThrow('chưa được cấp quyền');
  expect(service.redisCacheService.getJson).not.toHaveBeenCalled();
});
test('ALL is bounded and does not apply a default-branch predicate',async()=>{
  const service=Object.create(ThanhToanService.prototype) as any;
  const query={leftJoinAndSelect:jest.fn().mockReturnThis(),where:jest.fn().mockReturnThis(),orderBy:jest.fn().mockReturnThis(),addOrderBy:jest.fn().mockReturnThis(),take:jest.fn().mockReturnThis(),skip:jest.fn().mockReturnThis(),getMany:jest.fn().mockResolvedValue([]),getCount:jest.fn().mockResolvedValue(0)};
  service.donHangRepo={createQueryBuilder:jest.fn(()=>query)};
  service.redisCacheService={getJson:jest.fn().mockResolvedValue(null),setJson:jest.fn().mockResolvedValue(undefined)};
  await service.layDanhSachDonHangChoStaff({branchCode:'ALL',limit:10000},true);
  expect(query.take).toHaveBeenCalledWith(100);
  expect(query.where).toHaveBeenCalledWith('1=1',{branchCode:'ALL'});
});
