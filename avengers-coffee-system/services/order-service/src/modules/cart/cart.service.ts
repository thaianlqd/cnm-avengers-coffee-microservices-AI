import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from './cart.entity';

@Injectable()
export class CartService {
  constructor(@InjectRepository(CartItem) private cartRepo: Repository<CartItem>) {}

  async layGiỏHàng(ma_nguoi_dung: string) {
    return this.cartRepo.find({ where: { ma_nguoi_dung } });
  }

  async themVaoGiỏ(dto: any) {
    const { ma_nguoi_dung, ma_san_pham, size } = dto;
    const kichCo = size || 'Nhỏ';
    
    // Find all items with same user and product
    const items = await this.cartRepo.find({ where: { ma_nguoi_dung, ma_san_pham, size: kichCo } });
    
    let item = items.find(i => {
      // Compare toppings
      const t1 = [...(i.toppings || [])].sort().join(',');
      const t2 = [...(dto.toppings || [])].sort().join(',');
      if (t1 !== t2) return false;
      
      // Compare string fields
      if ((i.luong_da || '') !== (dto.luong_da || '')) return false;
      if ((i.do_ngot || '') !== (dto.do_ngot || '')) return false;
      if ((i.loai_sua || '') !== (dto.loai_sua || '')) return false;
      
      // Compare custom_attributes
      const aAttrs = i.custom_attributes || {};
      const bAttrs = dto.custom_attributes || {};
      const aKeys = Object.keys(aAttrs);
      const bKeys = Object.keys(bAttrs);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) {
        const valA = aAttrs[key];
        const valB = bAttrs[key];
        if (Array.isArray(valA) && Array.isArray(valB)) {
          if ([...valA].sort().join(',') !== [...valB].sort().join(',')) return false;
        } else if (valA !== valB) {
          return false;
        }
      }
      return true;
    });

    if (item) {
      item.so_luong += dto.so_luong;
      // Also update gia_ban in case it changed
      item.gia_ban = dto.gia_ban || item.gia_ban;
      return this.cartRepo.save(item);
    }
    
    return this.cartRepo.save(this.cartRepo.create({
      ...dto,
      size: kichCo,
      toppings: dto.toppings || [],
      luong_da: dto.luong_da || '',
      do_ngot: dto.do_ngot || '',
      loai_sua: dto.loai_sua || '',
      custom_attributes: dto.custom_attributes || {},
    }));
  }

  async xoaKhoiGiỏ(id: number) {
    return this.cartRepo.delete(id);
  }

  async xoaToanBoGio(ma_nguoi_dung: string) {
    return this.cartRepo.delete({ ma_nguoi_dung });
  }
}