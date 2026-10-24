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
    const sales = await this.spRepo.manager.query(`SELECT DISTINCT ON (product_id) product_id,sale_price,ends_at FROM orders.flash_sale WHERE enabled AND starts_at<=now() AND ends_at>now() ORDER BY product_id,sale_price`);
    const priced = products.map(product => {
      const sale = sales.find(row=>Number(row.product_id)===Number(product.ma_san_pham));
      return sale ? {...product, gia_niem_yet:product.gia_ban,gia_ban:sale.sale_price,flash_sale_ends_at:sale.ends_at} : product;
    });
    return salesBadges(this.spRepo.manager, priced);
  }

  layTatCaDanhMuc() {
    return this.dmRepo.find();
  }

  async layChiTietSanPham(id: number): Promise<SanPham | null> {
    // Detail and cards must show the same sales period and global bestseller rank.
    return (await this.layTatCaSanPham()).find(product => Number(product.ma_san_pham) === Number(id)) || null;
  }
}
