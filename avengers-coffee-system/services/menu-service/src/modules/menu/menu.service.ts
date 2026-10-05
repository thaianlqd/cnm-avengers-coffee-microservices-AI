import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SanPham } from './san-pham.entity';
import { DanhMuc } from './danh-muc.entity';
import { salesBadges } from '../../product-sales';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(SanPham) private spRepo: Repository<SanPham>,
    @InjectRepository(DanhMuc) private dmRepo: Repository<DanhMuc>,
  ) {}

  async layTatCaSanPham() {
    const products = await this.spRepo.find({ relations: ['danhMuc'] });
    return salesBadges(this.spRepo.manager, products);
  }

  layTatCaDanhMuc() {
    return this.dmRepo.find();
  }

  async layChiTietSanPham(id: number): Promise<SanPham | null> {
    // Detail and cards must show the same sales period and global bestseller rank.
    return (await this.layTatCaSanPham()).find(product => Number(product.ma_san_pham) === Number(id)) || null;
  }
}
