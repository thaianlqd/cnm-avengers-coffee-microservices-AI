import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoriteItem } from './entities/favorite-item.entity';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(FavoriteItem)
    private readonly favoriteRepo: Repository<FavoriteItem>,
  ) {}

  async layDanhSachYeuThich(maNguoiDung: string) {
    const rows = await this.favoriteRepo.find({
      where: { ma_nguoi_dung: maNguoiDung },
      order: { ngay_tao: 'DESC' },
    });

    return {
      total: rows.length,
      items: rows,
    };
  }

  async chuyenTrangThaiYeuThich(
    maNguoiDung: string,
    payload: {
      ma_san_pham?: string | number;
      ten_san_pham?: string;
      gia_ban?: number;
      hinh_anh_url?: string;
      danh_muc?: string;
    },
  ) {
    const maSanPham = String(payload.ma_san_pham || '').trim();
    if (!maSanPham) {
      throw new BadRequestException('ma_san_pham la bat buoc');
    }

    const existed = await this.favoriteRepo.findOne({
      where: { ma_nguoi_dung: maNguoiDung, ma_san_pham: maSanPham },
    });

    if (existed) {
      await this.favoriteRepo.remove(existed);
      return {
        action: 'removed',
        message: 'Da xoa san pham khoi danh sach yeu thich',
        product_id: maSanPham,
      };
    }

    const created = this.favoriteRepo.create({
      ma_nguoi_dung: maNguoiDung,
      ma_san_pham: maSanPham,
      ten_san_pham: payload.ten_san_pham ? String(payload.ten_san_pham).trim() : null,
      gia_ban: Number.isFinite(Number(payload.gia_ban)) ? Number(payload.gia_ban) : null,
      hinh_anh_url: payload.hinh_anh_url ? String(payload.hinh_anh_url).trim() : null,
      danh_muc: payload.danh_muc ? String(payload.danh_muc).trim() : null,
    });

    const saved = await this.favoriteRepo.save(created);
    return {
      action: 'added',
      message: 'Da them san pham vao danh sach yeu thich',
      item: saved,
    };
  }
}
