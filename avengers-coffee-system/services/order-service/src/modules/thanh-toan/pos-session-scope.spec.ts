import { getMetadataArgsStorage } from 'typeorm';
import { KioskShiftSession } from './entities/kiosk-shift-session.entity';
import { ThanhToanService } from './thanh-toan.service';

function createService(activeShift: any = null) {
  const service = Object.create(ThanhToanService.prototype) as any;
  const repository = {
    findOne: jest.fn().mockResolvedValue(activeShift),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  service.kioskShiftSessionRepo = repository;
  service.tinhTongHopDoiSoat = jest.fn().mockResolvedValue({
    tienMatThucThu: 0,
    doanhThuDonHoanThanh: 0,
    doanhThuKhongTienMat: 0,
    tienMatThuVao: 0,
    tienThoi: 0,
    doanhThuOnline: 0,
    doanhThuTaiShop: 0,
    tongDon: 0,
    tongDonTienMat: 0,
  });
  return { service, repository };
}

describe('POS session scopes', () => {
  it('opens distinct store and franchise-kiosk sessions', async () => {
    const { service, repository } = createService();

    await service.moCaChiNhanh({ branch_code: 'HC-01', cash_open: 100000 });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'HC-01', session_scope: 'STORE_BRANCH', trang_thai: 'OPEN' },
      order: { thoi_gian_mo_ca: 'DESC' },
    });
    expect(repository.save.mock.calls[0][0].session_scope).toBe('STORE_BRANCH');

    await service.moCaKiosk({ branch_code: 'KSK-01', cash_open: 100000 });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'KSK-01', session_scope: 'FRANCHISE_KIOSK', trang_thai: 'OPEN' },
      order: { thoi_gian_mo_ca: 'DESC' },
    });
    expect(repository.save.mock.calls[1][0].session_scope).toBe('FRANCHISE_KIOSK');
  });

  it('reads and closes only the selected session scope', async () => {
    const { service, repository } = createService();

    await service.layCaChiNhanhDangMo('HC-01');
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'HC-01', session_scope: 'STORE_BRANCH', trang_thai: 'OPEN' },
      order: { thoi_gian_mo_ca: 'DESC' },
    });
    await service.layCaKioskDangMo('KSK-01');
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'KSK-01', session_scope: 'FRANCHISE_KIOSK', trang_thai: 'OPEN' },
      order: { thoi_gian_mo_ca: 'DESC' },
    });

    const activeShift = {
      thoi_gian_mo_ca: new Date(Date.now() - 60_000),
      tien_dau_ca: 0,
      ghi_chu: null,
      du_lieu_chi_tiet: {},
    };
    repository.findOne.mockResolvedValue(activeShift);
    await service.chotCaChiNhanh({ branch_code: 'HC-01', cash_close: 0 });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'HC-01', session_scope: 'STORE_BRANCH', trang_thai: 'OPEN' },
    });
    await service.chotCaKiosk({ branch_code: 'KSK-01', cash_close: 0 });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'KSK-01', session_scope: 'FRANCHISE_KIOSK', trang_thai: 'OPEN' },
    });
  });

  it('ends a kiosk session immediately while its reconciliation awaits approval', async () => {
    const activeShift = {
      id: 'shift-1',
      co_so_ma: 'KSK-01',
      session_scope: 'FRANCHISE_KIOSK',
      trang_thai: 'OPEN',
      staff_username: 'kiosk-staff',
      thoi_gian_mo_ca: new Date(Date.now() - 60_000),
      tien_dau_ca: 100_000,
      ghi_chu: null,
      du_lieu_chi_tiet: {},
    };
    const { service, repository } = createService(activeShift);

    await service.chotCaKiosk({ branch_code: 'KSK-01', cash_close: 100_000, staff_username: 'kiosk-staff' });
    expect(activeShift.trang_thai).toBe('CLOSE_PENDING');
    expect(activeShift.thoi_gian_dong_ca).toEqual(activeShift.close_requested_at);
    expect(activeShift.close_requested_by).toBe('kiosk-staff');

    await service.layCaKioskDangMo('KSK-01');
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { co_so_ma: 'KSK-01', session_scope: 'FRANCHISE_KIOSK', trang_thai: 'OPEN' },
      order: { thoi_gian_mo_ca: 'DESC' },
    });

    repository.findOne.mockResolvedValueOnce(null);
    await service.moCaKiosk({ branch_code: 'KSK-01', staff_username: 'next-cashier', cash_open: 50_000 });
    expect(repository.save.mock.calls.at(-1)[0].trang_thai).toBe('OPEN');

    await service.xuLyYeuCauChotCaKiosk({
      shift_id: 'shift-1', branch_code: 'KSK-01', decision: 'APPROVE', manager_username: 'kiosk-admin',
    });
    expect(activeShift.trang_thai).toBe('CLOSED');
    expect(activeShift.close_approved_by).toBe('kiosk-admin');
    expect(activeShift.thoi_gian_dong_ca).toEqual(activeShift.close_requested_at);
  });

  it('allows the kiosk owner to close a cashier session while other staff cannot', async () => {
    const shift = { id: 's1', staff_username: 'cashier', trang_thai: 'OPEN', thoi_gian_mo_ca: new Date(), tien_dau_ca: 0, du_lieu_chi_tiet: {} };
    const { service } = createService(shift);
    await expect(service.chotCaKiosk({ branch_code: 'KSK-01', staff_username: 'other-staff', cash_close: 0 })).rejects.toThrow('Chỉ nhân viên đã mở ca');
    await service.chotCaKiosk({ branch_code: 'KSK-01', staff_username: 'owner', cash_close: 0, allow_manager_close: true });
    expect(shift.trang_thai).toBe('CLOSE_PENDING');
    expect((shift as any).close_requested_by).toBe('owner');
  });

  it('preserves the closed report when the administrator rejects reconciliation', async () => {
    const pendingShift = {
      id: 'shift-2', co_so_ma: 'KSK-01', session_scope: 'FRANCHISE_KIOSK', trang_thai: 'CLOSE_PENDING',
      thoi_gian_mo_ca: new Date(), close_requested_at: new Date(), close_requested_by: 'kiosk-staff',
      tien_dau_ca: 50_000, tien_cuoi_ca: 60_000, tien_mat_he_thong: 10_000, doanh_thu_he_thong: 10_000,
      tien_mat_ky_vong: 60_000, chenh_lech: 0, tong_don_hang: 1, tong_don_tien_mat: 1, du_lieu_chi_tiet: {},
    };
    const { service } = createService(pendingShift);

    await service.xuLyYeuCauChotCaKiosk({ shift_id: 'shift-2', branch_code: 'KSK-01', decision: 'REJECT' });

    expect(pendingShift.trang_thai).toBe('CLOSE_REJECTED');
    expect(pendingShift.tien_cuoi_ca).toBe(60_000);
    expect(pendingShift.close_requested_at).toBeInstanceOf(Date);
    expect(pendingShift.thoi_gian_dong_ca).toEqual(pendingShift.close_requested_at);
  });
});

describe('counter order loading', () => {
  it('skips delivery tracking for counter sales while keeping delivery order enrichment', async () => {
    const { service } = createService();
    const query: any = {};
    for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take', 'skip']) query[method] = jest.fn().mockReturnValue(query);
    const counter = { ma_don_hang: 'counter', loai_don_hang: 'MANG_DI', tong_tien: 30000, chi_tiet: [], giao_dich_thanh_toan: [] };
    query.getMany = jest.fn().mockResolvedValue([counter]);
    service.donHangRepo = { createQueryBuilder: () => query };
    service.redisCacheService = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    service.deliveryTrackingService = { getTrackingsByOrderIds: jest.fn().mockResolvedValue([]) };
    service.taoLichSuTrangThaiHienThi = () => [];

    await service.layDanhSachDonHangChoStaff({ branchCode: 'KSK-01' });
    expect(service.deliveryTrackingService.getTrackingsByOrderIds).not.toHaveBeenCalled();
    query.getMany.mockResolvedValue([counter, { ...counter, ma_don_hang: 'delivery', loai_don_hang: 'GIAO_TAN_NOI' }]);
    await service.layDanhSachDonHangChoStaff({ branchCode: 'KSK-01' });
    expect(service.deliveryTrackingService.getTrackingsByOrderIds).toHaveBeenCalledWith(['delivery']);
  });
});


describe('kiosk close review schema compatibility', () => {
  it('round-trips review metadata in the existing JSON journal without selecting optional columns', () => {
    const shift = new KioskShiftSession();
    shift.du_lieu_chi_tiet = { non_cash_revenue: 12000 };
    shift.close_requested_at = new Date('2026-10-24T05:00:00Z');
    shift.close_requested_by = 'cashier';
    shift.close_approved_at = new Date('2026-10-24T06:00:00Z');
    shift.close_approved_by = 'owner';
    shift.close_approval_note = 'Khớp tiền';
    shift.storeCloseReview();
    const reloaded = new KioskShiftSession();
    reloaded.du_lieu_chi_tiet = JSON.parse(JSON.stringify(shift.du_lieu_chi_tiet));
    reloaded.restoreCloseReview();
    expect(reloaded.close_requested_at).toEqual(shift.close_requested_at);
    expect(reloaded.close_approved_by).toBe('owner');
    expect(reloaded.close_approval_note).toBe('Khớp tiền');
    expect(reloaded.du_lieu_chi_tiet.non_cash_revenue).toBe(12000);
    const columns = getMetadataArgsStorage().columns.filter(column => column.target === KioskShiftSession).map(column => column.propertyName);
    expect(columns).not.toContain('close_requested_at');
    expect(columns).not.toContain('close_approved_by');
  });
});
