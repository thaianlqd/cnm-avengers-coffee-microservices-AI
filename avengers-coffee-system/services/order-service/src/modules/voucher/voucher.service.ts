import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher } from './voucher.entity';

@Injectable()
export class VoucherService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  async kiemTraVoucher(maVoucher: string, tongTien: number): Promise<{ so_tien_giam: number; voucher: Voucher }> {
    const code = maVoucher.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { ma_voucher: code, trang_thai: 'ACTIVE' } });

    if (!voucher) {
      throw new BadRequestException('Ma voucher khong ton tai hoac da bi vo hieu hoa');
    }

    if (voucher.han_su_dung && new Date() > new Date(voucher.han_su_dung)) {
      throw new BadRequestException('Ma voucher da het han su dung');
    }

    if (voucher.tong_luot_dung !== null && voucher.luot_da_dung >= voucher.tong_luot_dung) {
      throw new BadRequestException('Ma voucher da het luot su dung');
    }

    if (tongTien < Number(voucher.don_hang_toi_thieu)) {
      throw new BadRequestException(
        `Don hang can dat toi thieu ${Number(voucher.don_hang_toi_thieu).toLocaleString('vi-VN')}d de ap dung voucher nay`,
      );
    }

    let soTienGiam: number;
    if (voucher.loai === 'PERCENT') {
      soTienGiam = Math.round((tongTien * Number(voucher.gia_tri)) / 100);
      if (voucher.giam_toi_da !== null) {
        soTienGiam = Math.min(soTienGiam, Number(voucher.giam_toi_da));
      }
    } else {
      soTienGiam = Math.min(Number(voucher.gia_tri), tongTien);
    }

    return { so_tien_giam: soTienGiam, voucher };
  }

  async apDungVoucher(maVoucher: string): Promise<void> {
    await this.voucherRepo.increment({ ma_voucher: maVoucher.trim().toUpperCase() }, 'luot_da_dung', 1);
  }

  async layDanhSachVoucher() {
    const list = await this.voucherRepo.find({
      where: { trang_thai: 'ACTIVE' },
      order: { ngay_tao: 'DESC' },
    });
    return {
      items: list.map((v) => ({
        id: v.id,
        ma_voucher: v.ma_voucher,
        mo_ta: v.mo_ta,
        loai: v.loai,
        gia_tri: Number(v.gia_tri),
        giam_toi_da: v.giam_toi_da !== null ? Number(v.giam_toi_da) : null,
        don_hang_toi_thieu: Number(v.don_hang_toi_thieu),
        tong_luot_dung: v.tong_luot_dung,
        luot_da_dung: v.luot_da_dung,
        han_su_dung: v.han_su_dung,
      })),
    };
  }
}
