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

  findAll() {
    return this.inventoryRepo.find({ order: { ma_san_pham: 'ASC' } });
  }

  async upsertStock(payload: { ma_san_pham: number; so_luong_ton: number; muc_canh_bao?: number }) {
    const existing = await this.inventoryRepo.findOne({
      where: { ma_san_pham: payload.ma_san_pham },
    });

    if (existing) {
      existing.so_luong_ton = payload.so_luong_ton;
      if (payload.muc_canh_bao !== undefined) {
        existing.muc_canh_bao = payload.muc_canh_bao;
      }
      return this.inventoryRepo.save(existing);
    }

    const created = this.inventoryRepo.create({
      ma_san_pham: payload.ma_san_pham,
      so_luong_ton: payload.so_luong_ton,
      muc_canh_bao: payload.muc_canh_bao ?? 0,
    });
    return this.inventoryRepo.save(created);
  }

  async adjustStock(maSanPham: number, delta: number) {
    const item = await this.inventoryRepo.findOne({ where: { ma_san_pham: maSanPham } });
    if (!item) {
      throw new NotFoundException(`Khong tim thay ton kho cho ma_san_pham=${maSanPham}`);
    }

    item.so_luong_ton = Math.max(0, item.so_luong_ton + delta);
    return this.inventoryRepo.save(item);
  }
}
