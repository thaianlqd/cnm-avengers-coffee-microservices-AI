import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './inventory-item.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
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
}
