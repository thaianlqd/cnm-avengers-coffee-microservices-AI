import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BranchReviewService } from './branch-review.service';
import { BranchReview } from '../entities/branch-review.entity';
import { Review } from '../entities/review.entity';
import { isPublicReview } from './review-policy';
const orderId = '12345678-1234-4234-8234-123456789abc';
function setup({ owner = 'customer', state = 'HOAN_THANH', branch = 'CN-A', duplicate = false } = {}) {
  const branchRepo: any = { findOne: jest.fn(async () => duplicate ? { id: 1 } : null), create: jest.fn(value => value), save: jest.fn(async value => value) };
  const productRepo: any = { findOne: jest.fn(async () => null), create: jest.fn(value => value), save: jest.fn(async value => value) };
  const manager: any = {
    getRepository: jest.fn(entity => entity === BranchReview ? branchRepo : entity === Review ? productRepo : null),
    query: jest.fn(async sql => {
      if (sql.includes('FOR UPDATE')) return [{ ma_don_hang: orderId, ma_nguoi_dung: owner, co_so_ma: branch, trang_thai_don_hang: state }];
      if (sql.includes('nguoi_dung')) return [{ ho_ten: 'Nguyễn Minh Tuấn' }];
      if (sql.includes('shipper_delivery')) return [];
      return [{ ma_san_pham: 'coffee' }];
    }),
  };
  manager.transaction = callback => callback(manager); branchRepo.manager = manager;
  return { service: new BranchReviewService(branchRepo), branchRepo, productRepo, manager };
}
describe('Completed-order branch review boundary', () => {
  const dto = { ma_don_hang: orderId, ma_chi_nhanh: 'CN-A', diem_tong_quan: 5,
    danh_gia_mon: [{ ma_san_pham: 'coffee', so_sao: 4 }], nhan_xet: 'Cà phê đậm đà, nhân viên thân thiện.' };
  it('writes product and branch ratings in one transaction using the owned order and registered customer', async () => {
    const state = setup(); const review = await state.service.taoDanhGia({ ...dto, ten_nguoi_dung: 'Forged' }, 'customer');
    expect(review).toMatchObject({ ma_chi_nhanh: 'CN-A', ma_don_hang: orderId, ma_nguoi_dung: 'customer', ten_nguoi_dung: 'Nguyễn Minh Tuấn' });
    expect(state.productRepo.save).toHaveBeenCalled(); expect(state.manager.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('rejects attempts to attach branch A purchases to branch B', async () => {
    const state = setup(); await expect(state.service.taoDanhGia({ ...dto, ma_chi_nhanh: 'CN-B' }, 'customer')).rejects.toBeInstanceOf(BadRequestException);
    expect(state.branchRepo.save).not.toHaveBeenCalled();
  });
  it('rejects another customer, an incomplete order, and a duplicate without writes', async () => {
    for (const [settings, error] of [[{ owner: 'another' }, ForbiddenException], [{ state: 'DANG_GIAO' }, BadRequestException], [{ duplicate: true }, ConflictException]] as any) {
      const state = setup(settings); await expect(state.service.taoDanhGia(dto, 'customer')).rejects.toBeInstanceOf(error);
      expect(state.branchRepo.save).not.toHaveBeenCalled();
    }
  });
  it('rejects products not in the order and shipper ratings without a completed delivery', async () => {
    const state = setup();
    await expect(state.service.taoDanhGia({ ...dto, danh_gia_mon: [{ ma_san_pham: 'unbought', so_sao: 5 }] }, 'customer')).rejects.toBeInstanceOf(BadRequestException);
    await expect(state.service.taoDanhGia({ ...dto, danh_gia_shipper: 5 }, 'customer')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('hides marked fixtures while preserving natural customer feedback', () => {
    expect(isPublicReview({ nhan_xet: '[Dữ liệu mẫu] Cà phê ngon' })).toBe(false);
    expect(isPublicReview({ ten_nguoi_dung: 'Test User', nhan_xet: 'Nice' })).toBe(false);
    expect(isPublicReview({ nhan_xet: 'Quán yên tĩnh, phù hợp làm việc.' })).toBe(true);
  });
});
