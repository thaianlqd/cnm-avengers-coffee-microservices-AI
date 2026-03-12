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
    let item = await this.cartRepo.findOne({ where: { ma_nguoi_dung, ma_san_pham, size: kichCo } });

    if (item) {
      item.so_luong += dto.so_luong;
      return this.cartRepo.save(item);
    }
    return this.cartRepo.save(this.cartRepo.create({
      ...dto,
      size: kichCo,
    }));
  }

  async xoaKhoiGiỏ(id: number) {
    return this.cartRepo.delete(id);
  }
}