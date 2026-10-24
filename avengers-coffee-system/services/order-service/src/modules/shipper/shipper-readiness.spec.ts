import { ShipperService } from './shipper.service';

describe('Shipper readiness is explicit and shared by all dispatch paths', () => {
  let service: ShipperService;
  let shipperRepo: any, deliveryRepo: any, orderRepo: any;
  beforeEach(() => {
    shipperRepo = { findOne: jest.fn().mockResolvedValue({ id: 's1', branch_code: 'D9', status: 'INACTIVE' }), update: jest.fn().mockResolvedValue({}), increment: jest.fn().mockResolvedValue({}), create: jest.fn(value => value), save: jest.fn(value => value) };
    deliveryRepo = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn(value => value), save: jest.fn(value => ({ ...value, id: 'd1' })) };
    orderRepo = { findOne: jest.fn().mockResolvedValue({ ma_don_hang: 'o1', co_so_ma: 'D9', trang_thai_don_hang: 'DANG_GIAO', chi_tiet: [] }), update: jest.fn() };
    service = new ShipperService(shipperRepo, deliveryRepo, {} as any, {} as any, {} as any, {} as any, orderRepo, {} as any, { findOne: jest.fn().mockResolvedValue(null) } as any, { phatSongDonHangChoShipper: jest.fn(), guiThongBao: jest.fn() } as any, { delete: jest.fn().mockResolvedValue(null), getJson: jest.fn().mockResolvedValue(null) } as any);
    jest.spyOn(service, 'layDanhSachChiNhanh').mockResolvedValue([]);
    jest.spyOn(service, 'getBranchInfo' as any).mockResolvedValue({ store_name: 'D9' });
  });
  test.each(['INACTIVE', 'ON_BREAK', undefined])('rejects %s for manager assignment, self-accept and batch before delivery writes', async status => {
    shipperRepo.findOne.mockResolvedValue({ id: 's1', branch_code: 'D9', status });
    await expect(service.assignOrderToShipper('o1','s1','m1')).rejects.toThrow('Sẵn sàng nhận đơn');
    await expect(service.acceptOrder('s1','o1')).rejects.toThrow('Sẵn sàng nhận đơn');
    await expect(service.acceptBatchOrders('s1',['o1'])).rejects.toThrow('Sẵn sàng nhận đơn');
    expect(deliveryRepo.update).not.toHaveBeenCalled(); expect(deliveryRepo.save).not.toHaveBeenCalled(); expect(orderRepo.update).not.toHaveBeenCalled();
  });
  test('GPS from an existing journey does not switch an offline driver back online', async () => {
    await service.updateShipperLocation('s1',10.8,106.7);
    expect(shipperRepo.update).toHaveBeenCalledWith({ id:'s1' }, { current_latitude:10.8, current_longitude:106.7 });
  });
  test('only a valid explicit status request changes readiness', async () => {
    await expect(service.updateShipperStatus('s1','UNKNOWN' as any)).rejects.toThrow();
    expect(shipperRepo.update).not.toHaveBeenCalled();
    await service.updateShipperStatus('s1','ACTIVE');
    expect(shipperRepo.update).toHaveBeenCalledWith({ id:'s1' }, { status:'ACTIVE' });
  });
  test('account creation and password reset cannot make a driver available implicitly', async () => {
    shipperRepo.findOne.mockResolvedValueOnce(null);
    jest.spyOn(service, 'layDanhSachChiNhanh').mockResolvedValue([{ ma_chi_nhanh:'D9',loai_diem_ban:'CHI_NHANH_CHINH',trang_thai:'ACTIVE' }]);
    const created = await service.createShipper({ username:'new',full_name:'New',status:'ACTIVE',branch_code:'D9',password:'secret-new' });
    expect((created as any).status).toBe('INACTIVE');
    shipperRepo.findOne.mockResolvedValue({ id:'s1',status:'ACTIVE',username:'fixture' });
    const reset = await service.resetAccount('s1','fixture-password');
    expect(reset.shipper.status).toBe('INACTIVE');
  });
  test('an offline driver can replay their already accepted delivery without acquiring a new one', async () => {
    deliveryRepo.findOne.mockResolvedValue({ id:'d1', shipper_id:'s1', status:'CONFIRMED' });
    expect((await service.acceptOrder('s1','o1')).delivery.id).toBe('d1');
    expect(deliveryRepo.save).not.toHaveBeenCalled();
  });
  test('a ready driver still receives an assignment through the existing flow', async () => {
    shipperRepo.findOne.mockResolvedValue({ id:'s1', branch_code:'D9', status:'ACTIVE' });
    await service.assignOrderToShipper('o1','s1','m1');
    expect(deliveryRepo.save).toHaveBeenCalledWith(expect.objectContaining({status:'PENDING',shipper_id:'s1'}));
    expect(shipperRepo.increment).not.toHaveBeenCalled();
  });
  test('handing over an unclaimed order does not create a driver acceptance',async()=>{
    await service.markOrderReadyForDelivery('o1','D9');
    expect(deliveryRepo.save).not.toHaveBeenCalled();expect(shipperRepo.increment).not.toHaveBeenCalled();
  });
  test('a pending assignment can be changed but an accepted delivery cannot',async()=>{
    shipperRepo.findOne.mockResolvedValue({id:'s2',branch_code:'D9',status:'ACTIVE'});
    deliveryRepo.findOne.mockResolvedValue({id:'pending',shipper_id:'s1',status:'PENDING'});
    await service.assignOrderToShipper('o1','s2','manager');
    expect(deliveryRepo.update).toHaveBeenCalledWith({id:'pending'},{status:'CANCELLED'});
    expect(deliveryRepo.save).toHaveBeenCalledWith(expect.objectContaining({shipper_id:'s2',status:'PENDING'}));
    deliveryRepo.save.mockClear();deliveryRepo.findOne.mockResolvedValue({id:'claimed',shipper_id:'s1',status:'CONFIRMED'});
    await expect(service.assignOrderToShipper('o1','s2','manager')).rejects.toThrow('đã có tài xế nhận');
    expect(deliveryRepo.save).not.toHaveBeenCalled();
  });
  test('only the assigned driver can accept a pending assignment, then it becomes confirmed',async()=>{
    shipperRepo.findOne.mockResolvedValue({id:'s1',branch_code:'D9',status:'ACTIVE'});
    deliveryRepo.findOne.mockResolvedValue({id:'pending',shipper_id:'s2',status:'PENDING'});
    await expect(service.acceptOrder('s1','o1')).rejects.toThrow('tài xế khác');expect(deliveryRepo.save).not.toHaveBeenCalled();
    deliveryRepo.findOne.mockResolvedValue({id:'pending',shipper_id:'s1',status:'PENDING'});
    await service.acceptOrder('s1','o1');
    expect(deliveryRepo.save).toHaveBeenCalledWith(expect.objectContaining({status:'CONFIRMED',shipper_id:'s1'}));
    expect(shipperRepo.increment).toHaveBeenCalledTimes(1);
  });

  test('customer delivery lookup uses the latest record and only reports accepted drivers',async()=>{
    deliveryRepo.findOne.mockResolvedValue({id:'pending',status:'PENDING',shipper_id:'s1'});
    expect((await service.getCustomerDeliveryInfo('o1')).has_shipper).toBe(false);
    expect(deliveryRepo.findOne).toHaveBeenLastCalledWith({where:{ma_don_hang:'o1'},order:{assigned_at:'DESC'}});
    deliveryRepo.findOne.mockResolvedValue({id:'confirmed',status:'CONFIRMED',shipper_id:'s1'});
    expect((await service.getCustomerDeliveryInfo('o1')).has_shipper).toBe(true);
  });

});
