import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SanPham } from './san-pham.entity';
import { DanhMuc } from './danh-muc.entity';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(SanPham) private spRepo: Repository<SanPham>,
    @InjectRepository(DanhMuc) private dmRepo: Repository<DanhMuc>,
  ) {}

  layTatCaSanPham() {
    return this.spRepo.find({ relations: ['danhMuc'] });
  }

  layTatCaDanhMuc() {
    return this.dmRepo.find();
  }

  async layChiTietSanPham(id: number): Promise<SanPham | null> {
    return await this.spRepo.findOne({
      where: { ma_san_pham: id },
      relations: ['danhMuc'], 
    });
  }
}

