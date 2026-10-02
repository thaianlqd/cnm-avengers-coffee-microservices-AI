import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './inventory-item.entity';
import { KioskComboDelivery } from './kiosk-combo-delivery.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(KioskComboDelivery)
    private readonly comboRepo: Repository<KioskComboDelivery>,
  ) {}

  private normalizeBranchCode(branchCode?: string) {
    return String(branchCode || 'MAC_DINH_CHI').trim().toUpperCase();
  }

  findAll(branchCode?: string) {
    const co_so_ma = this.normalizeBranchCode(branchCode);
    return this.inventoryRepo.find({
      where: { co_so_ma },
      order: { ma_san_pham: 'ASC' },
    });
  }

  async upsertStock(payload: {
    ma_san_pham: number;
    so_luong_ton: number;
    muc_canh_bao?: number;
    dang_kinh_doanh?: boolean;
    branch_code?: string;
  }) {
    const co_so_ma = this.normalizeBranchCode(payload.branch_code);
    const existing = await this.inventoryRepo.findOne({
      where: { co_so_ma, ma_san_pham: payload.ma_san_pham },
    });

    if (existing) {
      existing.so_luong_ton = payload.so_luong_ton;
      if (payload.muc_canh_bao !== undefined) {
        existing.muc_canh_bao = payload.muc_canh_bao;
      }
      if (payload.dang_kinh_doanh !== undefined) {
        existing.dang_kinh_doanh = Boolean(payload.dang_kinh_doanh);
      }
      return this.inventoryRepo.save(existing);
    }

    const created = this.inventoryRepo.create({
      co_so_ma,
      ma_san_pham: payload.ma_san_pham,
      so_luong_ton: payload.so_luong_ton,
      muc_canh_bao: payload.muc_canh_bao ?? 0,
      dang_kinh_doanh: payload.dang_kinh_doanh ?? true,
    });
    return this.inventoryRepo.save(created);
  }

  async adjustStock(maSanPham: number, delta: number, branchCode?: string) {
    const co_so_ma = this.normalizeBranchCode(branchCode);
    const item = await this.inventoryRepo.findOne({ where: { co_so_ma, ma_san_pham: maSanPham } });
    if (!item) {
      throw new NotFoundException(`Khong tim thay ton kho cho ma_san_pham=${maSanPham} tai co so ${co_so_ma}`);
    }

    item.so_luong_ton = Math.max(0, item.so_luong_ton + delta);
    return this.inventoryRepo.save(item);
  }

  // ─── KIOSK COMBO DELIVERY ───────────────────────────────────────

  /** Manager tạo phiếu giao combo cho Kiosk */
  async taoComboGiao(payload: {
    ma_chi_nhanh_me: string;
    ma_kiosk: string;
    ten_combo: string;
    mo_ta?: string;
  }) {
    const combo = this.comboRepo.create({
      ma_chi_nhanh_me: payload.ma_chi_nhanh_me.toUpperCase(),
      ma_kiosk: payload.ma_kiosk.toUpperCase(),
      ten_combo: payload.ten_combo.trim(),
      mo_ta: payload.mo_ta?.trim() ?? null,
      trang_thai: 'PENDING',
    });
    return this.comboRepo.save(combo);
  }

  /** Lấy danh sách combo - Manager xem theo chi nhánh mẹ, Staff xem theo kiosk */
  async layDanhSachCombo(filter: {
    ma_chi_nhanh_me?: string;
    ma_kiosk?: string;
    trang_thai?: string;
  }) {
    const query = this.comboRepo.createQueryBuilder('c').orderBy('c.thoi_gian_giao', 'DESC');
    if (filter.ma_chi_nhanh_me) query.andWhere('c.ma_chi_nhanh_me = :me', { me: filter.ma_chi_nhanh_me.toUpperCase() });
    if (filter.ma_kiosk) query.andWhere('c.ma_kiosk = :kiosk', { kiosk: filter.ma_kiosk.toUpperCase() });
    if (filter.trang_thai) query.andWhere('c.trang_thai = :tt', { tt: filter.trang_thai });
    return query.getMany();
  }

  /** Kiosk Staff xác nhận đã nhận combo */
  async xacNhanNhanCombo(id: number, nguoi_nhan: string) {
    const combo = await this.comboRepo.findOne({ where: { id } });
    if (!combo) throw new NotFoundException('Không tìm thấy phiếu giao hàng');
    if (combo.trang_thai === 'RECEIVED') return combo;
    combo.trang_thai = 'RECEIVED';
    combo.thoi_gian_nhan = new Date();
    combo.nguoi_nhan = nguoi_nhan;
    return this.comboRepo.save(combo);
  }
}
