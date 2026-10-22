import { verifyShipperPassword } from './shipper-auth';
import { ShipperService } from './shipper.service';
describe('Store-owned shipper management', () => {
  let service:ShipperService, repo:any;
  beforeEach(() => {
    repo = { update:jest.fn(), findOne:jest.fn().mockResolvedValue(null),create:jest.fn(x=>x),save:jest.fn(x=>x) };
    service = new ShipperService(repo,null as any,null as any,null as any,null as any,null as any,null as any,null as any,null as any,null as any,null as any);
    jest.spyOn(service,'layDanhSachChiNhanh').mockResolvedValue([
      {ma_chi_nhanh:'D9',loai_diem_ban:'CHI_NHANH_CHINH',trang_thai:'ACTIVE'},
      {ma_chi_nhanh:'KSK_1',ten_chi_nhanh:'Kiosk Avengers',loai_diem_ban:'KIOSK_VE_TINH'},
    ]);
  });
  test('new account persists the entered password and stays unavailable until explicitly ready', async () => {
    const result:any = await service.createShipper({username:'new',full_name:'New',password:'new-secret',branch_code:'d9',vehicle_type:'MOTORBIKE'});
    expect(result.password).not.toBe('new-secret'); expect(verifyShipperPassword('new-secret', result.password)).toBe(true); expect(result.branch_code).toBe('D9'); expect(result.status).toBe('INACTIVE');
  });
  test.each(['KSK_1','missing',''])('rejects kiosk or invalid branch %s before save', async branch_code => {
    await expect(service.createShipper({username:'new',password:'new-secret',branch_code})).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
  test('rejects bicycle on create and update without changing existing rows', async () => {
    await expect(service.createShipper({username:'new',password:'new-secret',branch_code:'D9',vehicle_type:'BICYCLE'})).rejects.toThrow('xe máy hoặc ô tô');
    repo.findOne.mockResolvedValue({id:'s1',username:'old'});
    await expect(service.updateShipperInfo('s1',{vehicle_type:'BICYCLE'})).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
  test('vehicle self-service enforces the same supported types', async () => {
    await expect(service.updateVehicle('s1','BICYCLE','')).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
    await service.updateVehicle('s1','CAR','51A-001');
    expect(repo.update).toHaveBeenCalledWith({id:'s1'},{vehicle_type:'CAR',vehicle_plate:'51A-001'});
  });
  test('orders by creation time, not readiness status', async () => {
    const query:any = { orderBy:jest.fn().mockReturnThis(),addOrderBy:jest.fn().mockReturnThis(),getMany:jest.fn().mockResolvedValue([]) };
    repo.createQueryBuilder=jest.fn().mockReturnValue(query);
    await service.getAllShippers();
    expect(query.orderBy).toHaveBeenCalledWith('s.created_at','DESC');
    expect(query.addOrderBy).toHaveBeenCalledWith('s.id','DESC');
  });
});
