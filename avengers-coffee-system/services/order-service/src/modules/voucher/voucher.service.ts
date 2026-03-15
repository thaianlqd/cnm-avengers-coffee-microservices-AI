import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher } from './voucher.entity';

type VoucherValidationResult = {
  so_tien_giam: number;
  voucher: {
    ma_voucher: string;
    mo_ta: string | null;
    loai: string;
    gia_tri: number;
    giam_toi_da: number | null;
    don_hang_toi_thieu: number;
  };
  source: 'local' | 'promotion';
};

@Injectable()
export class VoucherService {
  private readonly IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';
  private readonly INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'avengers-internal-token';

  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  async kiemTraVoucher(maVoucher: string, tongTien: number, userId?: string): Promise<VoucherValidationResult> {
    const code = maVoucher.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { ma_voucher: code, trang_thai: 'ACTIVE' } });

    if (voucher) {
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

      return {
        so_tien_giam: soTienGiam,
        voucher: {
          ma_voucher: voucher.ma_voucher,
          mo_ta: voucher.mo_ta || null,
          loai: voucher.loai,
          gia_tri: Number(voucher.gia_tri),
          giam_toi_da: voucher.giam_toi_da !== null ? Number(voucher.giam_toi_da) : null,
          don_hang_toi_thieu: Number(voucher.don_hang_toi_thieu),
        },
        source: 'local',
      };
    }

    const identityResponse = await fetch(`${this.IDENTITY_SERVICE_URL}/promotions/kiem-tra`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        ma_khuyen_mai: code,
        user_id: userId || '',
        gia_tri_don: Number(tongTien || 0),
      }),
    });

    const identityPayload: any = await identityResponse.json().catch(() => ({}));
    if (!identityResponse.ok) {
      throw new BadRequestException(identityPayload?.message || 'Ma voucher khong ton tai hoac da bi vo hieu hoa');
    }

    return {
      so_tien_giam: Number(identityPayload?.so_tien_giam || 0),
      voucher: {
        ma_voucher: String(identityPayload?.ma_khuyen_mai || code),
        mo_ta: identityPayload?.ten_khuyen_mai || null,
        loai: String(identityPayload?.loai_khuyen_mai || 'AMOUNT'),
        gia_tri: Number(identityPayload?.gia_tri || 0),
        giam_toi_da: null,
        don_hang_toi_thieu: 0,
      },
      source: 'promotion',
    };
  }

  async apDungVoucher(maVoucher: string, userId?: string, soTienGiam?: number, maDonHang?: string): Promise<void> {
    const code = maVoucher.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { ma_voucher: code } });
    if (voucher) {
      await this.voucherRepo.increment({ ma_voucher: code }, 'luot_da_dung', 1);
      return;
    }

    const identityResponse = await fetch(`${this.IDENTITY_SERVICE_URL}/promotions/xac-nhan-su-dung`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        ma_khuyen_mai: code,
        user_id: userId || '',
        ma_don_hang: maDonHang || null,
        so_tien_giam: Number(soTienGiam || 0),
      }),
    });

    if (!identityResponse.ok) {
      const payload: any = await identityResponse.json().catch(() => ({}));
      throw new BadRequestException(payload?.message || 'Khong the ghi nhan su dung voucher');
    }
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
