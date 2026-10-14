import { ShipperService } from './shipper.service';

describe('Shipper readiness is explicit and shared by all dispatch paths', () => {
  let service: ShipperService;
  let shipperRepo: any, deliveryRepo: any, orderRepo: any;
  beforeEach(() => {
    shipperRepo = { findOne: jest.fn().mockResolvedValue({ id: 's1', branch_code: 'D9', status: 'INACTIVE' }), update: jest.fn().mockResolvedValue({}), create: jest.fn(value => value), save: jest.fn(value => value) };
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
    const created = await service.createShipper({ username:'new',full_name:'New',status:'ACTIVE' });
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
    expect(deliveryRepo.save).toHaveBeenCalled();
  });
});
