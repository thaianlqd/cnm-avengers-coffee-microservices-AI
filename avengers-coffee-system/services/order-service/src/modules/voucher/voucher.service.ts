import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  private mapVoucherToAdminItem(v: Voucher) {
    const now = new Date();
    let computedStatus = v.trang_thai || 'ACTIVE';
    if (v.han_su_dung && new Date(v.han_su_dung) < now) {
      computedStatus = 'EXPIRED';
    }
    if (v.tong_luot_dung !== null && v.tong_luot_dung > 0 && v.luot_da_dung >= v.tong_luot_dung) {
      if (computedStatus === 'ACTIVE') computedStatus = 'EXPIRED';
    }

    return {
      id: v.id,
      ma_voucher: v.ma_voucher,
      ma_khuyen_mai: v.ma_voucher,
      ten_voucher: v.ten_voucher || v.ma_voucher,
      ten_khuyen_mai: v.ten_voucher || v.ma_voucher,
      mo_ta: v.mo_ta || '',
      loai: v.loai || 'FIXED',
      loai_khuyen_mai: v.loai || 'FIXED',
      gia_tri: Number(v.gia_tri || 0),
      giam_toi_da: v.giam_toi_da !== null ? Number(v.giam_toi_da) : null,
      don_hang_toi_thieu: Number(v.don_hang_toi_thieu || 0),
      gia_tri_don_toi_thieu: Number(v.don_hang_toi_thieu || 0),
      tong_luot_dung: v.tong_luot_dung,
      so_luong_toi_da: v.tong_luot_dung || 0,
      luot_da_dung: v.luot_da_dung || 0,
      so_luong_da_dung: v.luot_da_dung || 0,
      gioi_han_moi_nguoi: v.gioi_han_moi_nguoi || 1,
      han_su_dung: v.han_su_dung,
      ngay_ket_thuc: v.han_su_dung,
      ngay_bat_dau: v.ngay_bat_dau,
      loai_phan_phoi: v.loai_phan_phoi || 'PUBLIC',
      ngu_canh_su_dung: v.ngu_canh_su_dung || '',
      so_ngay_hieu_luc: v.so_ngay_hieu_luc || 30,
      trang_thai: computedStatus,
      hien_thi_cho_khach: v.hien_thi_cho_khach !== false,
      ten_san_pham_tang: v.ten_san_pham_tang || null,
      hinh_anh: v.hinh_anh || null,
      ngay_tao: v.ngay_tao,
      ngay_cap_nhat: v.ngay_cap_nhat,
    };
  }

  /** Admin: Lấy danh sách toàn bộ Vouchers & Templates */
  async layDanhSachVoucherAdmin() {
    const list = await this.voucherRepo.find({
      order: { ngay_tao: 'DESC' },
    });
    return {
      total: list.length,
      items: list.map((v) => this.mapVoucherToAdminItem(v)),
    };
  }

  /** Admin: Tạo mới Voucher (Mã công khai hoặc Template) */
  async taoVoucherAdmin(payload: {
    ma_voucher?: string;
    ma_khuyen_mai?: string;
    ten_voucher?: string;
    ten_khuyen_mai?: string;
    mo_ta?: string;
    loai?: string;
    loai_khuyen_mai?: string;
    gia_tri?: number;
    giam_toi_da?: number | null;
    don_hang_toi_thieu?: number;
    gia_tri_don_toi_thieu?: number;
    tong_luot_dung?: number | null;
    so_luong_toi_da?: number;
    gioi_han_moi_nguoi?: number;
    han_su_dung?: string | null;
    ngay_ket_thuc?: string | null;
    ngay_bat_dau?: string | null;
    loai_phan_phoi?: string;
    ngu_canh_su_dung?: string | string[];
    so_ngay_hieu_luc?: number;
    trang_thai?: string;
    hien_thi_cho_khach?: boolean;
    ten_san_pham_tang?: string | null;
    hinh_anh?: string | null;
  }) {
    const loaiPhanPhoi = (payload.loai_phan_phoi || 'PUBLIC').toUpperCase();
    let code = String(payload.ma_voucher || payload.ma_khuyen_mai || '').trim().toUpperCase().replace(/\s+/g, '_');

    if (loaiPhanPhoi === 'TEMPLATE') {
      if (!code) {
        code = `TPL_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }
    } else {
      if (!code || !/^[A-Z0-9_]+$/.test(code)) {
        throw new BadRequestException('Mã công khai chỉ được dùng ký tự A-Z, 0-9, _');
      }
    }

    const existed = await this.voucherRepo.findOne({ where: { ma_voucher: code } });
    if (existed) throw new BadRequestException(`Mã voucher '${code}' đã tồn tại`);

    let rawLoai = String(payload.loai || payload.loai_khuyen_mai || 'FIXED').toUpperCase();
    if (rawLoai === 'AMOUNT') rawLoai = 'FIXED';

    let nguCanh = '';
    if (Array.isArray(payload.ngu_canh_su_dung)) {
      nguCanh = payload.ngu_canh_su_dung.join(',');
    } else if (typeof payload.ngu_canh_su_dung === 'string') {
      nguCanh = payload.ngu_canh_su_dung;
    }

    const v = new Voucher();
    v.ma_voucher = code;
    v.ten_voucher = String(payload.ten_voucher || payload.ten_khuyen_mai || '').trim() || code;
    v.mo_ta = payload.mo_ta?.trim() || null;
    v.loai = rawLoai;
    v.gia_tri = Number(payload.gia_tri || 0);
    v.giam_toi_da = payload.giam_toi_da !== undefined && payload.giam_toi_da !== null ? Number(payload.giam_toi_da) : null;
    v.don_hang_toi_thieu = Number(payload.don_hang_toi_thieu || payload.gia_tri_don_toi_thieu || 0);
    
    const maxUse = payload.tong_luot_dung !== undefined ? payload.tong_luot_dung : payload.so_luong_toi_da;
    v.tong_luot_dung = maxUse && Number(maxUse) > 0 ? Number(maxUse) : null;
    v.luot_da_dung = 0;
    
    const expDate = payload.han_su_dung || payload.ngay_ket_thuc;
    v.han_su_dung = expDate ? new Date(expDate) : null;
    v.ngay_bat_dau = payload.ngay_bat_dau ? new Date(payload.ngay_bat_dau) : null;
    
    v.loai_phan_phoi = loaiPhanPhoi;
    v.ngu_canh_su_dung = nguCanh;
    v.so_ngay_hieu_luc = Number(payload.so_ngay_hieu_luc || 30);
    v.gioi_han_moi_nguoi = Math.max(1, Number(payload.gioi_han_moi_nguoi || 1));
    v.trang_thai = ['ACTIVE', 'INACTIVE'].includes(String(payload.trang_thai || 'ACTIVE').toUpperCase())
      ? String(payload.trang_thai).toUpperCase()
      : 'ACTIVE';
    v.hien_thi_cho_khach = payload.hien_thi_cho_khach !== false;
    v.ten_san_pham_tang = payload.ten_san_pham_tang?.trim() || null;
    v.hinh_anh = payload.hinh_anh?.trim() || null;

    const saved = await this.voucherRepo.save(v);
    return { message: 'Tạo voucher / template thành công', item: this.mapVoucherToAdminItem(saved) };
  }

  /** Admin: Cập nhật Voucher / Template */
  async capNhatVoucherAdmin(
    code: string,
    payload: {
      ten_voucher?: string;
      ten_khuyen_mai?: string;
      mo_ta?: string;
      loai?: string;
      loai_khuyen_mai?: string;
      gia_tri?: number;
      giam_toi_da?: number | null;
      don_hang_toi_thieu?: number;
      gia_tri_don_toi_thieu?: number;
      tong_luot_dung?: number | null;
      so_luong_toi_da?: number;
      gioi_han_moi_nguoi?: number;
      han_su_dung?: string | null;
      ngay_ket_thuc?: string | null;
      ngay_bat_dau?: string | null;
      loai_phan_phoi?: string;
      ngu_canh_su_dung?: string | string[];
      so_ngay_hieu_luc?: number;
      trang_thai?: string;
      hien_thi_cho_khach?: boolean;
      ten_san_pham_tang?: string | null;
      hinh_anh?: string | null;
    },
  ) {
    const safeCode = code.toUpperCase();
    const v = await this.voucherRepo.findOne({ where: { ma_voucher: safeCode } });
    if (!v) throw new NotFoundException('Không tìm thấy voucher');

    if (payload.ten_voucher !== undefined || payload.ten_khuyen_mai !== undefined) {
      v.ten_voucher = String(payload.ten_voucher || payload.ten_khuyen_mai).trim();
    }
    if (payload.mo_ta !== undefined) v.mo_ta = payload.mo_ta?.trim() || null;
    if (payload.gia_tri !== undefined) v.gia_tri = Number(payload.gia_tri);
    if (payload.giam_toi_da !== undefined) v.giam_toi_da = payload.giam_toi_da !== null ? Number(payload.giam_toi_da) : null;
    
    if (payload.don_hang_toi_thieu !== undefined || payload.gia_tri_don_toi_thieu !== undefined) {
      v.don_hang_toi_thieu = Number(payload.don_hang_toi_thieu ?? payload.gia_tri_don_toi_thieu);
    }
    
    if (payload.tong_luot_dung !== undefined || payload.so_luong_toi_da !== undefined) {
      const maxUse = payload.tong_luot_dung !== undefined ? payload.tong_luot_dung : payload.so_luong_toi_da;
      v.tong_luot_dung = maxUse && Number(maxUse) > 0 ? Number(maxUse) : null;
    }
    
    if (payload.gioi_han_moi_nguoi !== undefined) v.gioi_han_moi_nguoi = Math.max(1, Number(payload.gioi_han_moi_nguoi));
    if (payload.han_su_dung !== undefined || payload.ngay_ket_thuc !== undefined) {
      const expDate = payload.han_su_dung ?? payload.ngay_ket_thuc;
      v.han_su_dung = expDate ? new Date(expDate) : null;
    }
    if (payload.ngay_bat_dau !== undefined) v.ngay_bat_dau = payload.ngay_bat_dau ? new Date(payload.ngay_bat_dau) : null;
    
    if (payload.loai_phan_phoi !== undefined) v.loai_phan_phoi = String(payload.loai_phan_phoi).toUpperCase();
    if (payload.ngu_canh_su_dung !== undefined) {
      if (Array.isArray(payload.ngu_canh_su_dung)) {
        v.ngu_canh_su_dung = payload.ngu_canh_su_dung.join(',');
      } else {
        v.ngu_canh_su_dung = String(payload.ngu_canh_su_dung);
      }
    }
    if (payload.so_ngay_hieu_luc !== undefined) v.so_ngay_hieu_luc = Number(payload.so_ngay_hieu_luc);
    if (payload.trang_thai !== undefined) {
      const s = String(payload.trang_thai).toUpperCase();
      if (['ACTIVE', 'INACTIVE'].includes(s)) v.trang_thai = s;
    }
    if (payload.hien_thi_cho_khach !== undefined) v.hien_thi_cho_khach = Boolean(payload.hien_thi_cho_khach);
    if (payload.ten_san_pham_tang !== undefined) v.ten_san_pham_tang = payload.ten_san_pham_tang?.trim() || null;
    if (payload.hinh_anh !== undefined) v.hinh_anh = payload.hinh_anh?.trim() || null;

    const saved = await this.voucherRepo.save(v);
    return { message: 'Cập nhật voucher thành công', item: this.mapVoucherToAdminItem(saved) };
  }

  /** Admin: Xóa Voucher / Template */
  async xoaVoucherAdmin(code: string) {
    const safeCode = code.toUpperCase();
    const v = await this.voucherRepo.findOne({ where: { ma_voucher: safeCode } });
    if (!v) throw new NotFoundException('Không tìm thấy voucher');
    await this.voucherRepo.remove(v);
    return { message: 'Xóa voucher thành công' };
  }

  /** Internal / Admin: Lấy danh sách Template theo Ngữ cảnh */
  async layTemplatesTheoNguCanh(nguCanh?: string) {
    const list = await this.voucherRepo.find({
      where: { loai_phan_phoi: 'TEMPLATE', trang_thai: 'ACTIVE' },
      order: { ngay_tao: 'DESC' },
    });

    if (!nguCanh) {
      return { items: list.map((v) => this.mapVoucherToAdminItem(v)) };
    }

    const filtered = list.filter((v) => {
      if (!v.ngu_canh_su_dung) return false;
      const contexts = v.ngu_canh_su_dung.split(',').map((c) => c.trim().toUpperCase());
      return contexts.includes(nguCanh.toUpperCase());
    });

    return { items: filtered.map((v) => this.mapVoucherToAdminItem(v)) };
  }

  /** Internal: Lấy chi tiết 1 Template theo mã */
  async layTemplateByCode(code: string) {
    const v = await this.voucherRepo.findOne({ where: { ma_voucher: code.toUpperCase() } });
    if (!v) return null;
    return this.mapVoucherToAdminItem(v);
  }

  async kiemTraVoucher(maVoucher: string, tongTien: number, userId?: string): Promise<VoucherValidationResult> {
    const code = maVoucher.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { ma_voucher: code, trang_thai: 'ACTIVE' } });

    if (voucher && (voucher.loai_phan_phoi === 'PUBLIC' || !voucher.loai_phan_phoi)) {
      if (voucher.ngay_bat_dau && new Date() < new Date(voucher.ngay_bat_dau)) {
        throw new BadRequestException('Mã voucher chưa đến ngày sử dụng');
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
      } else if (voucher.loai === 'FREE_ITEM' || voucher.ma_voucher?.includes('TOPPING') || voucher.mo_ta?.toLowerCase().includes('topping')) {
        const freeVal = Number(voucher.gia_tri) > 0 ? Number(voucher.gia_tri) : 10000;
        soTienGiam = Math.min(freeVal, tongTien);
      } else {
        const val = Number(voucher.gia_tri || 0);
        soTienGiam = Math.min(val > 0 ? val : 10000, tongTien);
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

    // Nếu không phải mã PUBLIC trên orders.voucher, kiểm tra mã cá nhân ở identity-service
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
    if (voucher && (voucher.loai_phan_phoi === 'PUBLIC' || !voucher.loai_phan_phoi)) {
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
      where: { trang_thai: 'ACTIVE', loai_phan_phoi: 'PUBLIC', hien_thi_cho_khach: true },
      order: { ngay_tao: 'DESC' },
    });
    return {
      items: list.map((v) => ({
        id: v.id,
        ma_voucher: v.ma_voucher,
        ten_voucher: v.ten_voucher || v.ma_voucher,
        mo_ta: v.mo_ta,
        loai: v.loai,
        gia_tri: Number(v.gia_tri),
        giam_toi_da: v.giam_toi_da !== null ? Number(v.giam_toi_da) : null,
        don_hang_toi_thieu: Number(v.don_hang_toi_thieu),
        tong_luot_dung: v.tong_luot_dung,
        luot_da_dung: v.luot_da_dung,
        han_su_dung: v.han_su_dung,
        hinh_anh: v.hinh_anh,
      })),
    };
  }
}
