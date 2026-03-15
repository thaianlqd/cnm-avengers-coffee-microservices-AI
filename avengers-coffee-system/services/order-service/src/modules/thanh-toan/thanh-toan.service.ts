import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { RedisCacheService } from '../../infrastructure/cache/redis-cache.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { CartItem } from '../cart/cart.entity';
import { NotificationService } from '../notification/notification.service';
import { VoucherService } from '../voucher/voucher.service';
import { CaLamViecNhanVien } from './entities/ca-lam-viec-nhan-vien.entity';
import { CaDoiSoat } from './entities/ca-doi-soat.entity';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { DonHang } from './entities/don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';

type KhoiTaoThanhToanDto = {
  phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG';
  dia_chi_giao_hang: string;
  khung_gio_giao?: string;
  ghi_chu?: string;
  ma_voucher?: string;
  branch_code?: string;
};

type TaoDonTaiQuayDto = {
  ma_nguoi_dung?: string;
  ten_khach_hang?: string;
  ten_thu_ngan?: string;
  loai_don_hang: 'TAI_CHO' | 'MANG_DI';
  ma_ban?: string;
  ghi_chu?: string;
  tien_khach_dua?: number;
  branch_code?: string;
  phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG';
  items: Array<{
    ma_san_pham: number;
    ten_san_pham: string;
    so_luong: number;
    gia_ban: number;
  }>;
};

type CapNhatDonHangDto = {
  dia_chi_giao_hang?: string;
  khung_gio_giao?: string;
  ghi_chu?: string;
  items?: Array<{
    id: number;
    so_luong: number;
  }>;
};

type CapNhatDonHangChoStaffDto = {
  dia_chi_giao_hang?: string;
  khung_gio_giao?: string;
  ghi_chu?: string;
  ten_khach_hang?: string;
  ma_ban?: string;
  tien_khach_dua?: number;
  items?: Array<{
    ma_san_pham: number;
    ten_san_pham: string;
    so_luong: number;
    gia_ban: number;
  }>;
};

type SepayPayload = {
  transferType?: string;
  transferAmount?: number;
  content?: string;
  referenceCode?: string;
};

type BoLocLichSuDonHang = {
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  keyword?: string;
  branchCode?: string;
};

type LichSuTrangThai = {
  loai: 'ORDER' | 'PAYMENT';
  trang_thai: string;
  thoi_gian: string;
  ghi_chu?: string;
};

type DoiSoatPreviewInput = {
  shiftDate?: string;
  from?: string;
  to?: string;
  cashOpen?: string;
  cashClose?: string;
  branchCode?: string;
};

type ChotCaInput = {
  shift_date?: string;
  from: string;
  to: string;
  cash_open: number;
  cash_close: number;
  note?: string;
  staff_name?: string;
  branch_code?: string;
};

type TaoLichLamViecInput = {
  staff_username: string;
  staff_name?: string;
  shift_date: string;
  shift_template?: '2_CA' | '3_CA';
  shift_code: 'SANG' | 'CHIEU' | 'TOI';
  shift_codes?: Array<'SANG' | 'CHIEU' | 'TOI'>;
  note?: string;
  manager_username?: string;
  branch_code?: string;
};

type BoLocLichLamViec = {
  from?: string;
  to?: string;
  staff_username?: string;
  branchCode?: string;
};

type CapNhatChamCongInput = {
  attendance_status?: 'ASSIGNED' | 'PRESENT' | 'ABSENT';
  check_in_at?: string | null;
  check_out_at?: string | null;
  note?: string;
};

type PheDuyetDoiSoatInput = {
  status: 'APPROVED' | 'REJECTED';
  manager_name?: string;
  approval_note?: string;
};

@Injectable()
export class ThanhToanService {
  // VNPAY sandbox defaults; env names aligned with docker-compose.
  private readonly VNP_TMN_CODE = process.env.VNPAY_TMN_CODE || process.env.VNP_TMN_CODE || 'MEBLXEDU';
  private readonly VNP_HASH_SECRET = process.env.VNPAY_HASH_SECRET || process.env.VNP_HASH_SECRET || 'T718SPDGIGQSKGM98VCSNAF70M9X93MC';
  private readonly VNP_URL = process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly VNP_RETURN_BASE_URL = process.env.PAYMENT_RETURN_BASE_URL || process.env.VNP_RETURN_BASE_URL || 'http://localhost:3000';
  private readonly SEPAY_BANK_CODE = process.env.SEPAY_BANK_CODE || 'MBBank';
  private readonly SEPAY_ACCOUNT_NO = process.env.SEPAY_ACCOUNT_NO || '025452790502';
  private readonly IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';
  private readonly INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'avengers-internal-token';

  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepo: Repository<CartItem>,
    @InjectRepository(DonHang)
    private readonly donHangRepo: Repository<DonHang>,
    @InjectRepository(ChiTietDonHang)
    private readonly chiTietRepo: Repository<ChiTietDonHang>,
    @InjectRepository(GiaoDichThanhToan)
    private readonly giaoDichRepo: Repository<GiaoDichThanhToan>,
    @InjectRepository(CaDoiSoat)
    private readonly caDoiSoatRepo: Repository<CaDoiSoat>,
    @InjectRepository(CaLamViecNhanVien)
    private readonly caLamViecNhanVienRepo: Repository<CaLamViecNhanVien>,
    private readonly notificationService: NotificationService,
    private readonly voucherService: VoucherService,
    private readonly redisCacheService: RedisCacheService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  private normalizeBranchCode(branchCode?: string) {
    return String(branchCode || 'MAC_DINH_CHI').trim().toUpperCase();
  }

  private toVnDateKey(input?: string | Date) {
    const source = input ? new Date(input) : new Date();
    if (Number.isNaN(source.getTime())) {
      throw new BadRequestException('Ngay chot ca khong hop le');
    }

    const vn = new Date(source.getTime() + 7 * 60 * 60 * 1000);
    const year = vn.getUTCFullYear();
    const month = String(vn.getUTCMonth() + 1).padStart(2, '0');
    const day = String(vn.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private taoKhoangChotCaTheoNgay(shiftDate?: string, from?: string, to?: string) {
    const normalizedDate = shiftDate?.trim()
      ? this.toVnDateKey(`${shiftDate.trim()}T00:00:00+07:00`)
      : this.toVnDateKey(from || to || new Date());

    const caBatDau = new Date(`${normalizedDate}T07:00:00+07:00`);
    const caKetThuc = new Date(`${normalizedDate}T22:00:00+07:00`);
    if (Number.isNaN(caBatDau.getTime()) || Number.isNaN(caKetThuc.getTime())) {
      throw new BadRequestException('Khoang chot ca khong hop le');
    }

    return {
      shiftDate: normalizedDate,
      from: caBatDau,
      to: caKetThuc,
    };
  }

  private taoKhoangDuLieuTheoNgay(shiftDate: string) {
    const batDauNgay = new Date(`${shiftDate}T00:00:00+07:00`);
    const ketThucNgay = new Date(`${shiftDate}T23:59:59.999+07:00`);

    if (Number.isNaN(batDauNgay.getTime()) || Number.isNaN(ketThucNgay.getTime())) {
      throw new BadRequestException('Khoang du lieu theo ngay khong hop le');
    }

    return {
      from: batDauNgay,
      to: ketThucNgay,
    };
  }

  private layThoiGianHoanThanhDon(donHang: DonHang) {
    const lichSu = Array.isArray(donHang.lich_su_trang_thai) ? donHang.lich_su_trang_thai : [];
    const mocHoanThanh = [...lichSu]
      .filter((item) => item?.loai === 'ORDER' && item?.trang_thai === 'HOAN_THANH' && item?.thoi_gian)
      .sort((a, b) => new Date(b.thoi_gian).getTime() - new Date(a.thoi_gian).getTime())[0];

    if (mocHoanThanh?.thoi_gian) {
      const parsed = new Date(mocHoanThanh.thoi_gian);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (donHang.trang_thai_don_hang === 'HOAN_THANH') {
      return donHang.ngay_cap_nhat || donHang.ngay_tao;
    }

    return null;
  }

  private async layTapUsernameNhanVienTheoChiNhanh(branchCode: string) {
    const endpoint = `${this.IDENTITY_SERVICE_URL}/users/workforce?role=STAFF&branch_code=${encodeURIComponent(branchCode)}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
        },
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Khong tai duoc danh sach nhan vien theo chi nhanh');
      }

      const usernames = (Array.isArray(payload?.items) ? payload.items : [])
        .map((item: any) => String(item?.ten_dang_nhap || item?.tenDangNhap || item?.username || '').trim().toLowerCase())
        .filter(Boolean);

      return new Set(usernames);
    } catch (error) {
      throw new BadRequestException('Khong the dong bo danh sach nhan vien theo chi nhanh');
    }
  }

  private xacDinhCoSoGanNhatTheoDiaChi(diaChi: string) {
    const normalized = String(diaChi || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const macDinhChiHints = [
      'mac dinh chi',
      'phuong sai gon',
      'quan 1',
      'q1',
    ];

    const theGraceHints = [
      'the grace tower',
      'grace tower',
      'hoang van thai',
      'tan phu',
      'quan 7',
      'q7',
    ];

    if (theGraceHints.some((keyword) => normalized.includes(keyword))) {
      return 'THE_GRACE_TOWER';
    }

    if (macDinhChiHints.some((keyword) => normalized.includes(keyword))) {
      return 'MAC_DINH_CHI';
    }

    return 'MAC_DINH_CHI';
  }

  private buildCustomerOrdersCacheKey(maNguoiDung: string, boLoc: BoLocLichSuDonHang) {
    return `orders:customer:${maNguoiDung}:${JSON.stringify(boLoc || {})}`;
  }

  private buildStaffOrdersCacheKey(branchCode: string, boLoc: BoLocLichSuDonHang) {
    return `orders:staff:${branchCode}:${JSON.stringify(boLoc || {})}`;
  }

  private async invalidateOrderCaches(maNguoiDung?: string | null, branchCode?: string | null) {
    if (maNguoiDung) {
      await this.redisCacheService.deleteByPrefix(`orders:customer:${maNguoiDung}:`);
      await this.redisCacheService.deleteByPrefix(`notifications:${maNguoiDung}:`);
    }

    if (branchCode) {
      await this.redisCacheService.deleteByPrefix(`orders:staff:${branchCode}:`);
    }
  }

  private async publishOrderCreatedEvent(order: DonHang) {
    await this.rabbitMqService.publish('order.created', {
      orderId: order.ma_don_hang,
      userId: order.ma_nguoi_dung,
      branchCode: order.co_so_ma,
      totalAmount: Number(order.tong_tien || 0),
      paymentMethod: order.phuong_thuc_thanh_toan,
      status: order.trang_thai_don_hang,
    });
  }

  async xemTruocDoiSoatCa(input: DoiSoatPreviewInput) {
    const khoang = this.taoKhoangChotCaTheoNgay(input.shiftDate, input.from, input.to);
    const khoangDuLieuNgay = this.taoKhoangDuLieuTheoNgay(khoang.shiftDate);
    const branchCode = this.normalizeBranchCode(input.branchCode);
    const tongHop = await this.tinhTongHopDoiSoat(khoangDuLieuNgay.from, khoangDuLieuNgay.to, branchCode);
    const tienDauCa = this.chuanHoaSoTien(input.cashOpen, 0);
    const tienCuoiCa = input.cashClose === undefined ? null : this.chuanHoaSoTien(input.cashClose, 0);
    const tienMatKyVong = tienDauCa + tongHop.tienMatThucThu;
    const chenhLech = tienCuoiCa === null ? null : tienCuoiCa - tienMatKyVong;
    const existingShift = await this.caDoiSoatRepo.findOne({
      where: {
        co_so_ma: branchCode,
        thoi_gian_bat_dau: khoang.from,
        thoi_gian_ket_thuc: khoang.to,
      },
      order: { ngay_tao: 'DESC' },
    });

    return {
      shift_date: khoang.shiftDate,
      range: {
        from: khoang.from.toISOString(),
        to: khoang.to.toISOString(),
      },
      data_range: {
        from: khoangDuLieuNgay.from.toISOString(),
        to: khoangDuLieuNgay.to.toISOString(),
      },
      system: {
        total_orders: tongHop.tongDon,
        total_revenue: tongHop.doanhThuDonHoanThanh,
        cash_orders: tongHop.tongDonTienMat,
        cash_revenue: tongHop.tienMatThucThu,
        cash_in_gross: tongHop.tienMatThuVao,
        cash_change_out: tongHop.tienThoi,
        non_cash_revenue: tongHop.doanhThuKhongTienMat,
        online_revenue: tongHop.doanhThuOnline,
        in_store_revenue: tongHop.doanhThuTaiShop,
      },
      reconciliation: {
        cash_open: tienDauCa,
        expected_cash_close: tienMatKyVong,
        cash_close: tienCuoiCa,
        difference: chenhLech,
      },
      existing_shift: existingShift ? this.dinhDangCaDoiSoat(existingShift) : null,
    };
  }

  async chotCaLamViec(input: ChotCaInput) {
    const khoang = this.taoKhoangChotCaTheoNgay(input.shift_date, input.from, input.to);
    const khoangDuLieuNgay = this.taoKhoangDuLieuTheoNgay(khoang.shiftDate);
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const tongHop = await this.tinhTongHopDoiSoat(khoangDuLieuNgay.from, khoangDuLieuNgay.to, branchCode);

    const daCoBienBan = await this.caDoiSoatRepo.findOne({
      where: {
        co_so_ma: branchCode,
        thoi_gian_bat_dau: khoang.from,
        thoi_gian_ket_thuc: khoang.to,
      },
      order: { ngay_tao: 'DESC' },
    });
    if (daCoBienBan) {
      throw new BadRequestException('Ngay nay da duoc chot ca. Ban co the sua hoac xoa bien ban cu.');
    }

    const tienDauCa = this.chuanHoaSoTien(input.cash_open, 0);
    const tienCuoiCa = this.chuanHoaSoTien(input.cash_close, 0);
    const tienMatKyVong = tienDauCa + tongHop.tienMatThucThu;
    const chenhLech = tienCuoiCa - tienMatKyVong;

    const ca = await this.caDoiSoatRepo.save(
      this.caDoiSoatRepo.create({
        co_so_ma: branchCode,
        thoi_gian_bat_dau: khoang.from,
        thoi_gian_ket_thuc: khoang.to,
        tien_dau_ca: tienDauCa,
        tien_cuoi_ca: tienCuoiCa,
        tien_mat_he_thong: tongHop.tienMatThucThu,
        doanh_thu_he_thong: tongHop.doanhThuDonHoanThanh,
        tien_mat_ky_vong: tienMatKyVong,
        chenh_lech: chenhLech,
        tong_don: tongHop.tongDon,
        tong_don_tien_mat: tongHop.tongDonTienMat,
        ghi_chu: input.note?.trim() || null,
        ten_nhan_vien: input.staff_name?.trim() || null,
        trang_thai_phe_duyet: 'PENDING',
        manager_duyet: null,
        ghi_chu_phe_duyet: null,
        thoi_gian_phe_duyet: null,
        du_lieu_tom_tat: {
          shift_date: khoang.shiftDate,
          non_cash_revenue: tongHop.doanhThuKhongTienMat,
          cash_in_gross: tongHop.tienMatThuVao,
          cash_change_out: tongHop.tienThoi,
          cash_net: tongHop.tienMatThucThu,
          online_revenue: tongHop.doanhThuOnline,
          in_store_revenue: tongHop.doanhThuTaiShop,
        },
      }),
    );

    return {
      message: 'Chot ca thanh cong',
      shift: this.dinhDangCaDoiSoat(ca),
    };
  }

  async layLichSuChotCa(limit = 10, branchCodeRaw?: string) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const rows = await this.caDoiSoatRepo.find({
      where: { co_so_ma: branchCode },
      order: { thoi_gian_bat_dau: 'DESC', ngay_tao: 'DESC' },
      take: safeLimit,
    });

    return {
      total: rows.length,
      items: rows.map((row) => this.dinhDangCaDoiSoat(row)),
    };
  }


  async suaCaLamViec(maCa: string, input: { cash_open?: number; cash_close?: number; note?: string; staff_name?: string; branch_code?: string }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const ca = await this.caDoiSoatRepo.findOne({ where: { ma_ca: maCa, co_so_ma: branchCode } });
    if (!ca) throw new NotFoundException('Khong tim thay ca lam viec');
    if (input.cash_open !== undefined) ca.tien_dau_ca = Number(input.cash_open);
    if (input.cash_close !== undefined) ca.tien_cuoi_ca = Number(input.cash_close);
    if (input.note !== undefined) ca.ghi_chu = input.note?.trim() || null;
    if (input.staff_name !== undefined) ca.ten_nhan_vien = input.staff_name?.trim() || null;
    ca.tien_mat_ky_vong = Number(ca.tien_dau_ca) + Number(ca.tien_mat_he_thong);
    ca.chenh_lech = Number(ca.tien_cuoi_ca) - Number(ca.tien_mat_ky_vong);
    ca.trang_thai_phe_duyet = 'PENDING';
    ca.manager_duyet = null;
    ca.ghi_chu_phe_duyet = null;
    ca.thoi_gian_phe_duyet = null;
    const updated = await this.caDoiSoatRepo.save(ca);
    return { message: 'Cap nhat ca thanh cong', ma_ca: updated.ma_ca };
  }

  async xoaCaLamViec(maCa: string, branchCodeRaw?: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const ca = await this.caDoiSoatRepo.findOne({ where: { ma_ca: maCa, co_so_ma: branchCode } });
    if (!ca) throw new NotFoundException('Khong tim thay ca lam viec');
    await this.caDoiSoatRepo.remove(ca);
    return { message: 'Xoa ca thanh cong', ma_ca: maCa };
  }

  async pheDuyetDoiSoatCaLamViec(maCa: string, input: PheDuyetDoiSoatInput & { branch_code?: string }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const ca = await this.caDoiSoatRepo.findOne({ where: { ma_ca: maCa, co_so_ma: branchCode } });
    if (!ca) throw new NotFoundException('Khong tim thay ca doi soat');
    if (!['APPROVED', 'REJECTED'].includes(input.status)) {
      throw new BadRequestException('Trang thai phe duyet khong hop le');
    }

    ca.trang_thai_phe_duyet = input.status;
    ca.manager_duyet = input.manager_name?.trim() || null;
    ca.ghi_chu_phe_duyet = input.approval_note?.trim() || null;
    ca.thoi_gian_phe_duyet = new Date();

    const updated = await this.caDoiSoatRepo.save(ca);
    return {
      message: input.status === 'APPROVED' ? 'Phe duyet doi soat thanh cong' : 'Da tu choi doi soat',
      shift: this.dinhDangCaDoiSoat(updated),
    };
  }

  async taoLichLamViecChoManager(input: TaoLichLamViecInput) {
    const staffUsername = String(input.staff_username || '').trim();
    if (!staffUsername) {
      throw new BadRequestException('staff_username la bat buoc');
    }

    const shiftDate = String(input.shift_date || '').trim();
    if (!shiftDate) {
      throw new BadRequestException('shift_date la bat buoc');
    }

    const requestedShiftCodes = Array.from(
      new Set(
        (Array.isArray(input.shift_codes) && input.shift_codes.length ? input.shift_codes : [input.shift_code])
          .map((code) => String(code || '').trim().toUpperCase()),
      ),
    ) as Array<'SANG' | 'CHIEU' | 'TOI'>;
    const validCodes = requestedShiftCodes.filter((code) => ['SANG', 'CHIEU', 'TOI'].includes(code));
    if (!validCodes.length) {
      throw new BadRequestException('Vui long chon it nhat 1 khung ca hop le');
    }

    const branchCode = this.normalizeBranchCode(input.branch_code);
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode);
    if (!validStaffByBranch.has(staffUsername.toLowerCase())) {
      throw new BadRequestException('Nhan vien khong thuoc chi nhanh dang thao tac');
    }

    const entities: CaLamViecNhanVien[] = [];
    for (const shiftCode of validCodes) {
      const shiftSlot = this.layKhungCaLamViec(shiftCode);
      if (!shiftSlot) {
        throw new BadRequestException(`Khung ca ${shiftCode} khong hop le`);
      }

      const existed = await this.caLamViecNhanVienRepo.findOne({
        where: {
          co_so_ma: branchCode,
          staff_username: staffUsername,
          ngay_lam_viec: shiftDate,
          ma_khung_ca: shiftCode,
        },
      });
      if (existed) {
        throw new BadRequestException(`Nhan vien da duoc xep lich o khung ca ${shiftCode}`);
      }

      entities.push(
        this.caLamViecNhanVienRepo.create({
          co_so_ma: branchCode,
          staff_username: staffUsername,
          staff_name: input.staff_name?.trim() || staffUsername,
          ngay_lam_viec: shiftDate,
          ma_khung_ca: shiftCode,
          ten_ca: shiftSlot.ten_ca,
          gio_bat_dau: shiftSlot.gio_bat_dau,
          gio_ket_thuc: shiftSlot.gio_ket_thuc,
          note: input.note?.trim() || null,
          manager_username: input.manager_username?.trim() || null,
          trang_thai_cham_cong: 'ASSIGNED',
          check_in_at: null,
          check_out_at: null,
        }),
      );
    }

    const saved = await this.caLamViecNhanVienRepo.save(entities);
    return {
      message: `Tao lich lam viec thanh cong (${saved.length} ca)`,
      item: this.dinhDangCaLamViec(saved[0]),
      items: saved.map((row) => this.dinhDangCaLamViec(row)),
      created_count: saved.length,
    };
  }

  async layDanhSachLichLamViecChoManager(boLoc: BoLocLichLamViec = {}) {
    const branchCode = this.normalizeBranchCode(boLoc.branchCode);
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode);
    const query = this.caLamViecNhanVienRepo
      .createQueryBuilder('ca')
      .where('ca.co_so_ma = :branchCode', { branchCode });

    if (boLoc.from) {
      query.andWhere('ca.ngay_lam_viec >= :from', { from: boLoc.from });
    }
    if (boLoc.to) {
      query.andWhere('ca.ngay_lam_viec <= :to', { to: boLoc.to });
    }
    if (boLoc.staff_username?.trim()) {
      query.andWhere('ca.staff_username ILIKE :staff', { staff: `%${boLoc.staff_username.trim()}%` });
    }

    const rows = await query
      .orderBy('ca.ngay_lam_viec', 'DESC')
      .addOrderBy('ca.gio_bat_dau', 'ASC')
      .addOrderBy('ca.ngay_tao', 'DESC')
      .getMany();

    const filteredRows = rows.filter((row) => validStaffByBranch.has(String(row.staff_username || '').trim().toLowerCase()));

    return {
      total: filteredRows.length,
      items: filteredRows.map((row) => this.dinhDangCaLamViec(row)),
    };
  }

  async capNhatChamCongCaLamViecChoManager(maCaLamViec: string, input: CapNhatChamCongInput & { branch_code?: string }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const ca = await this.caLamViecNhanVienRepo.findOne({
      where: { ma_ca_lam_viec: maCaLamViec, co_so_ma: branchCode },
    });
    if (!ca) {
      throw new NotFoundException('Khong tim thay ca lam viec');
    }

    const parseOptionalDate = (value?: string | null) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Dinh dang thoi gian check-in/check-out khong hop le');
      }
      return parsed;
    };

    const allowedStatus = ['ASSIGNED', 'PRESENT', 'ABSENT'];
    if (input.attendance_status !== undefined && !allowedStatus.includes(input.attendance_status)) {
      throw new BadRequestException('attendance_status khong hop le');
    }

    const nextCheckIn = parseOptionalDate(input.check_in_at);
    const nextCheckOut = parseOptionalDate(input.check_out_at);
    const finalCheckIn = nextCheckIn === undefined ? ca.check_in_at : nextCheckIn;
    const finalCheckOut = nextCheckOut === undefined ? ca.check_out_at : nextCheckOut;
    if (finalCheckIn && finalCheckOut && finalCheckOut.getTime() < finalCheckIn.getTime()) {
      throw new BadRequestException('check_out_at khong duoc nho hon check_in_at');
    }

    if (input.attendance_status !== undefined) {
      ca.trang_thai_cham_cong = input.attendance_status;
    }
    if (input.note !== undefined) {
      ca.note = input.note?.trim() || null;
    }

    if (ca.trang_thai_cham_cong === 'ABSENT') {
      ca.check_in_at = null;
      ca.check_out_at = null;
    } else {
      if (nextCheckIn !== undefined) {
        ca.check_in_at = nextCheckIn;
      }
      if (nextCheckOut !== undefined) {
        ca.check_out_at = nextCheckOut;
      }

      if (!input.attendance_status && (nextCheckIn instanceof Date || nextCheckOut instanceof Date)) {
        ca.trang_thai_cham_cong = 'PRESENT';
      }
    }

    const updated = await this.caLamViecNhanVienRepo.save(ca);
    return {
      message: 'Cap nhat cham cong thanh cong',
      item: this.dinhDangCaLamViec(updated),
    };
  }

  async xoaLichLamViecChoManager(maCaLamViec: string, branchCodeRaw?: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const ca = await this.caLamViecNhanVienRepo.findOne({
      where: { ma_ca_lam_viec: maCaLamViec, co_so_ma: branchCode },
    });
    if (!ca) {
      throw new NotFoundException('Khong tim thay ca lam viec');
    }

    await this.caLamViecNhanVienRepo.remove(ca);
    return {
      message: 'Xoa lich lam viec thanh cong',
      ma_ca_lam_viec: maCaLamViec,
    };
  }

  async layLichLamViecChoStaff(staffUsername: string, from?: string, to?: string, branchCodeRaw?: string) {
    const normalizedUsername = String(staffUsername || '').trim();
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode);
    if (!normalizedUsername) {
      throw new BadRequestException('staff_username la bat buoc');
    }

    if (!validStaffByBranch.has(normalizedUsername.toLowerCase())) {
      return {
        total: 0,
        items: [],
      };
    }

    const query = this.caLamViecNhanVienRepo
      .createQueryBuilder('ca')
      .where('ca.staff_username = :staffUsername', { staffUsername: normalizedUsername })
      .andWhere('ca.co_so_ma = :branchCode', { branchCode });

    if (from) {
      query.andWhere('ca.ngay_lam_viec >= :from', { from });
    }
    if (to) {
      query.andWhere('ca.ngay_lam_viec <= :to', { to });
    }

    const rows = await query
      .orderBy('ca.ngay_lam_viec', 'ASC')
      .addOrderBy('ca.gio_bat_dau', 'ASC')
      .getMany();

    return {
      total: rows.length,
      items: rows.map((row) => this.dinhDangCaLamViec(row)),
    };
  }

  async khoiTaoThanhToan(maNguoiDung: string, dto: KhoiTaoThanhToanDto, ipAddr = '127.0.0.1') {
    if (!dto.dia_chi_giao_hang?.trim()) {
      throw new BadRequestException('dia_chi_giao_hang la bat buoc');
    }

    const gioHang = await this.cartRepo.find({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!gioHang.length) {
      throw new BadRequestException('Gio hang trong, khong the thanh toan');
    }

    const tongTienGoc = gioHang.reduce((sum, item) => sum + Number(item.gia_ban) * item.so_luong, 0);

    // --- Áp dụng voucher nếu có ---
    let soTienGiam = 0;
    let maVoucherApDung: string | null = null;
    if (dto.ma_voucher?.trim()) {
      const voucherResult = await this.voucherService.kiemTraVoucher(dto.ma_voucher.trim(), tongTienGoc, maNguoiDung);
      soTienGiam = voucherResult.so_tien_giam;
      maVoucherApDung = voucherResult.voucher.ma_voucher;
    }
    const tongTien = Math.max(0, tongTienGoc - soTienGiam);
    const branchCode = dto.branch_code?.trim()
      ? this.normalizeBranchCode(dto.branch_code)
      : this.xacDinhCoSoGanNhatTheoDiaChi(dto.dia_chi_giao_hang);

    const trangThaiThanhToanBanDau = dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
      ? 'CHO_THANH_TOAN_KHI_NHAN_HANG'
      : 'CHO_XU_LY';

    const maDonHang = crypto.randomUUID();

    // 1. Tạo đơn hàng
    const donHang = await this.donHangRepo.save(this.donHangRepo.create({
      ma_don_hang: maDonHang,
      ma_nguoi_dung: maNguoiDung,
      co_so_ma: branchCode,
      tong_tien: tongTien,
      ma_voucher: maVoucherApDung,
      so_tien_giam: soTienGiam,
      dia_chi_giao_hang: dto.dia_chi_giao_hang,
      khung_gio_giao: dto.khung_gio_giao ?? null,
      ghi_chu: dto.ghi_chu ?? null,
      phuong_thuc_thanh_toan: dto.phuong_thuc_thanh_toan,
      trang_thai_thanh_toan: trangThaiThanhToanBanDau,
      trang_thai_don_hang: 'MOI_TAO',
      tien_khach_dua: null,
      tien_thoi: 0,
      lich_su_trang_thai: [
        {
          loai: 'ORDER',
          trang_thai: 'MOI_TAO',
          thoi_gian: new Date().toISOString(),
          ghi_chu: 'Don hang vua duoc tao',
        },
        {
          loai: 'PAYMENT',
          trang_thai: trangThaiThanhToanBanDau,
          thoi_gian: new Date().toISOString(),
          ghi_chu: 'Khoi tao thanh toan',
        },
      ],
    }));

    // 2. Lưu chi tiết đơn hàng
    const chiTiet = gioHang.map((item) =>
      this.chiTietRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        gia_ban: Number(item.gia_ban),
        so_luong: item.so_luong,
        kich_co: item.size || 'Nhỏ',
        hinh_anh_url: item.hinh_anh_url,
      }),
    );
    await this.chiTietRepo.save(chiTiet);

    // 3. Tạo mã tham chiếu giao dịch
    const maThamChieu = dto.phuong_thuc_thanh_toan === 'VNPAY'
        ? `${donHang.ma_don_hang}_${Date.now()}`
        : this.taoMaThamChieu(dto.phuong_thuc_thanh_toan, donHang.ma_don_hang);

    const giaoDich = await this.giaoDichRepo.save(
      this.giaoDichRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        cong_thanh_toan: dto.phuong_thuc_thanh_toan,
        ma_tham_chieu: maThamChieu,
        so_tien: tongTien,
        trang_thai: dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? 'CHO_THU_TIEN' : 'CHO_THANH_TOAN',
      }),
    );

    // Đánh dấu voucher đã được dùng sau khi đơn hàng tạo thành công
    if (maVoucherApDung) {
      await this.voucherService.apDungVoucher(maVoucherApDung, maNguoiDung, soTienGiam, donHang.ma_don_hang);
    }

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Don hang da duoc tao',
      noi_dung: `Don #${donHang.ma_don_hang} da duoc tao thanh cong.${soTienGiam > 0 ? ` Giam gia: ${soTienGiam.toLocaleString('vi-VN')}d` : ''}`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_don_hang: donHang.trang_thai_don_hang },
    });

    await this.cartRepo.delete({ ma_nguoi_dung: maNguoiDung });
    await this.invalidateOrderCaches(maNguoiDung, branchCode);
    await this.publishOrderCreatedEvent(donHang);

    // 4. Xử lý logic từng phương thức
    if (dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
      await Promise.all([
        this.notificationService.taoThongBao({
          ma_nguoi_dung: maNguoiDung,
          tieu_de: 'Don COD cho thu tien',
          noi_dung: `Don #${donHang.ma_don_hang} se duoc thu tien khi giao hang.`,
          loai: 'PAYMENT',
          du_lieu: { ma_don_hang: donHang.ma_don_hang, phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG' },
        }),
        // COD: tích điểm ngay khi đặt hàng (điểm chờ xác nhận)
        this.tichDiemLoyalty(maNguoiDung, tongTienGoc),
      ]);
      return { message: 'Da tao don hang COD thanh cong', don_hang: donHang, giao_dich: giaoDich };
    }

    if (dto.phuong_thuc_thanh_toan === 'VNPAY') {
      const redirectUrl = this.taoUrlVnpayThat(
        maNguoiDung,
        donHang.ma_don_hang,
        tongTien,
        maThamChieu,
        this.chuanHoaIpVnpay(ipAddr),
      );
      await this.notificationService.taoThongBao({
        ma_nguoi_dung: maNguoiDung,
        tieu_de: 'Cho thanh toan VNPAY',
        noi_dung: `Don #${donHang.ma_don_hang} dang cho ban hoan tat thanh toan VNPAY.`,
        loai: 'PAYMENT',
        du_lieu: { ma_don_hang: donHang.ma_don_hang, phuong_thuc_thanh_toan: 'VNPAY' },
      });
      return { message: 'Da khoi tao VNPAY', don_hang: donHang, redirect_url: redirectUrl };
    }

    // Mặc định là NGAN_HANG_QR (Sepay)
    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Da tao ma QR ngan hang',
      noi_dung: `Don #${donHang.ma_don_hang} da san sang thanh toan qua QR.`,
      loai: 'PAYMENT',
      du_lieu: { ma_don_hang: donHang.ma_don_hang, phuong_thuc_thanh_toan: 'NGAN_HANG_QR' },
    });
    return {
      message: 'Da khoi tao thanh toan QR ngan hang',
      don_hang: donHang,
      payment_details: {
        ma_don_hang: donHang.ma_don_hang,
        so_tien: tongTien,
        ma_tham_chieu: maThamChieu,
        qr_img_url: this.taoQrNganHang(tongTien, maThamChieu),
      },
    };
  }

  // --- VNPAY LOGIC ---
  private taoUrlVnpayThat(maNguoiDung: string, maDonHang: string, tongTien: number, txnRef: string, ipAddr: string) {
    const returnBase = this.VNP_RETURN_BASE_URL.replace(/\/+$/, '');
    const returnUrl = `${returnBase}/customers/${maNguoiDung}/thanh-toan/vnpay/ket-qua`;
    const now = new Date();
    const createDate = this.formatVnpDate(now);
    const expireDate = this.formatVnpDate(new Date(now.getTime() + 20 * 60 * 1000));

    const params: any = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.VNP_TMN_CODE,
        vnp_Amount: String(Math.round(tongTien) * 100),
        vnp_CreateDate: createDate,
        vnp_CurrCode: 'VND',
        vnp_IpAddr: ipAddr,
        vnp_Locale: 'vn',
        vnp_OrderInfo: `Thanh toan don hang ${maDonHang}`,
        vnp_OrderType: 'billpayment',
        vnp_ReturnUrl: returnUrl,
        vnp_TxnRef: txnRef,
        vnp_ExpireDate: expireDate,
    };

    // 1. Sắp xếp các tham số theo thứ tự alphabet của key
    const sortedKeys = Object.keys(params).sort();
    
    // 2. Tạo chuỗi query
    const signData = sortedKeys
        .map((key) => {
            const value = params[key];
            if (value === null || value === undefined || value === '') return null;
            // Quan trọng: Cả key và value đều phải được encode đúng chuẩn
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .filter(Boolean)
        .join('&');

    // 3. Tạo SecureHash (HMAC-SHA512)
    const hmac = crypto.createHmac('sha512', this.VNP_HASH_SECRET);
    // Lưu ý: VNPAY yêu cầu encodeURIComponent nhưng có một số ký tự đặc biệt 
    // encodeURIComponent của JS có thể khác với thư viện của VNPAY (hiếm gặp nhưng cần lưu ý)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex').toUpperCase();
    
    // 4. Build URL cuối cùng
    const finalUrl = `${this.VNP_URL}?${signData}&vnp_SecureHash=${signed}`;
    
    return finalUrl;
}

  async xuLyVnpayIpn(query: Record<string, string>) {
    const vnp_SecureHash = query.vnp_SecureHash;
    const clone = { ...query };
    delete clone.vnp_SecureHash; delete clone.vnp_SecureHashType;

    const signData = new URLSearchParams(Object.keys(clone).sort().reduce((obj, key) => { obj[key] = clone[key]; return obj; }, {})).toString();
    const hmac = crypto.createHmac('sha512', this.VNP_HASH_SECRET);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (signed !== vnp_SecureHash) return { RspCode: '97', Message: 'Invalid signature' };

    const giaoDich = await this.giaoDichRepo.findOne({ where: { ma_tham_chieu: query.vnp_TxnRef } });
    if (!giaoDich) return { RspCode: '01', Message: 'Order not found' };
    if (giaoDich.trang_thai === 'THANH_CONG') return { RspCode: '02', Message: 'Order already confirmed' };

    const soTienVnpay = Number(query.vnp_Amount || 0);
    const soTienHeThong = Math.round(Number(giaoDich.so_tien) * 100);
    if (soTienVnpay !== soTienHeThong) return { RspCode: '04', Message: 'Invalid amount' };

    if (query.vnp_ResponseCode === '00') {
      giaoDich.trang_thai = 'THANH_CONG';
      await this.capNhatTrangThaiDonHangHeThong(giaoDich.ma_don_hang, {
        trang_thai_thanh_toan: 'DA_THANH_TOAN',
        trang_thai_don_hang: 'DA_XAC_NHAN',
        ghi_chu: 'Thanh toan VNPAY thanh cong',
      });
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: giaoDich.ma_don_hang } });
      if (donHang) {
        await Promise.all([
          this.notificationService.taoThongBao({
            ma_nguoi_dung: donHang.ma_nguoi_dung,
            tieu_de: 'Thanh toan thanh cong',
            noi_dung: `Don #${donHang.ma_don_hang} da thanh toan thanh cong va duoc xac nhan.`,
            loai: 'PAYMENT',
            du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_thanh_toan: 'DA_THANH_TOAN' },
          }),
          this.tichDiemLoyalty(donHang.ma_nguoi_dung, Number(donHang.tong_tien) + Number(donHang.so_tien_giam || 0)),
        ]);
      }
    } else {
      giaoDich.trang_thai = 'THAT_BAI';
      await this.capNhatTrangThaiDonHangHeThong(giaoDich.ma_don_hang, {
        trang_thai_thanh_toan: 'THAT_BAI',
        ghi_chu: 'Thanh toan VNPAY that bai',
      });
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: giaoDich.ma_don_hang } });
      if (donHang) {
        await this.notificationService.taoThongBao({
          ma_nguoi_dung: donHang.ma_nguoi_dung,
          tieu_de: 'Thanh toan that bai',
          noi_dung: `Don #${donHang.ma_don_hang} thanh toan that bai. Ban vui long thu lai.`,
          loai: 'PAYMENT',
          du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_thanh_toan: 'THAT_BAI' },
        });
      }
    }
    await this.giaoDichRepo.save(giaoDich);
    return { RspCode: '00', Message: 'Confirm Success' };
  }

  async ketQuaVnpayThat(maNguoiDung: string, query: Record<string, string>) {
    const maDonHang = (query.vnp_TxnRef || '').split('_')[0];
    let donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung } });
    if (!donHang) throw new NotFoundException('Khong tim thay don hang');

    if (query.vnp_ResponseCode === '00' && donHang.trang_thai_thanh_toan !== 'DA_THANH_TOAN') {
      const ipnResult = await this.xuLyVnpayIpn(query);
      if (ipnResult.RspCode !== '00' && ipnResult.RspCode !== '02') {
        return { message: 'That bai', don_hang: donHang };
      }

      const donHangMoiNhat = await this.donHangRepo.findOne({
        where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung },
      });
      if (donHangMoiNhat) {
        donHang = donHangMoiNhat;
      }
    }

    const thanhCong = donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN';
    return { message: thanhCong ? 'Thanh cong' : 'That bai', don_hang: donHang };
  }

  // --- SEPAY WEBHOOK LOGIC ---
  async xuLyWebhookSepay(payload: SepayPayload, headers: any, rawBody: string) {
    if ((payload.transferType || '').toLowerCase() !== 'in') return { success: true };

    const qrRef = this.trichXuatMaThamChieuQr(payload.content || '');
    if (!qrRef) return { success: true, message: 'No QR Ref' };

    // MBBank strips hyphens (QR-xxx-yyy → QRxxxyyy), nên normalize để lookup
    const qrRefNormalized = qrRef.replace(/-/g, '');
    let giaoDich = await this.giaoDichRepo.findOne({ where: { ma_tham_chieu: qrRef, cong_thanh_toan: 'NGAN_HANG_QR' } });
    if (!giaoDich) {
      giaoDich = await this.giaoDichRepo
        .createQueryBuilder('g')
        .where("REPLACE(g.ma_tham_chieu, '-', '') = :ref", { ref: qrRefNormalized })
        .andWhere("g.cong_thanh_toan = 'NGAN_HANG_QR'")
        .getOne();
    }
    if (!giaoDich || giaoDich.trang_thai === 'THANH_CONG') return { success: true };

    if (Number(giaoDich.so_tien) === Number(payload.transferAmount)) {
      giaoDich.trang_thai = 'THANH_CONG';
      giaoDich.ma_giao_dich_cong = payload.referenceCode ?? null;
      giaoDich.du_lieu_tho = rawBody?.slice(0, 4000) ?? null;
      await this.giaoDichRepo.save(giaoDich);
      await this.capNhatTrangThaiDonHangHeThong(giaoDich.ma_don_hang, {
        trang_thai_thanh_toan: 'DA_THANH_TOAN',
        trang_thai_don_hang: 'DA_XAC_NHAN',
        ghi_chu: 'Nhan thanh toan QR thanh cong',
      });
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: giaoDich.ma_don_hang } });
      if (donHang) {
        await Promise.all([
          this.notificationService.taoThongBao({
            ma_nguoi_dung: donHang.ma_nguoi_dung,
            tieu_de: 'Nhan tien QR thanh cong',
            noi_dung: `Don #${donHang.ma_don_hang} da nhan thanh toan QR va duoc xac nhan.`,
            loai: 'PAYMENT',
            du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_thanh_toan: 'DA_THANH_TOAN' },
          }),
          this.tichDiemLoyalty(donHang.ma_nguoi_dung, Number(donHang.tong_tien) + Number(donHang.so_tien_giam || 0)),
        ]);
      }
    }
    return { success: true };
  }

  async taoDonTaiQuayChoStaff(dto: TaoDonTaiQuayDto, ipAddr = '127.0.0.1') {
    const loaiDon = dto.loai_don_hang;
    if (!['TAI_CHO', 'MANG_DI'].includes(loaiDon)) {
      throw new BadRequestException('loai_don_hang khong hop le');
    }

    const phuongThuc = dto.phuong_thuc_thanh_toan;
    if (!['THANH_TOAN_KHI_NHAN_HANG', 'NGAN_HANG_QR', 'VNPAY'].includes(phuongThuc)) {
      throw new BadRequestException('phuong_thuc_thanh_toan khong hop le');
    }

    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
      throw new BadRequestException('Don tai quay phai co it nhat 1 mon');
    }

    const normalizedItems = items.map((item) => ({
      ma_san_pham: Number(item.ma_san_pham),
      ten_san_pham: String(item.ten_san_pham || '').trim(),
      so_luong: Number(item.so_luong),
      gia_ban: Number(item.gia_ban),
    }));

    const isInvalidItem = normalizedItems.some(
      (item) =>
        Number.isNaN(item.ma_san_pham) ||
        !item.ten_san_pham ||
        Number.isNaN(item.so_luong) ||
        item.so_luong <= 0 ||
        Number.isNaN(item.gia_ban) ||
        item.gia_ban < 0,
    );

    if (isInvalidItem) {
      throw new BadRequestException('Du lieu mon trong don khong hop le');
    }

    const tongTien = normalizedItems.reduce((sum, item) => sum + item.gia_ban * item.so_luong, 0);
    const branchCode = this.normalizeBranchCode(dto.branch_code);
    const isCash = phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG';
    const tienKhachDua = isCash ? Math.max(Number(dto.tien_khach_dua ?? tongTien), 0) : null;
    if (isCash && (tienKhachDua as number) < tongTien) {
      throw new BadRequestException('Tien khach dua khong du de tao don COD');
    }
    const tienThoi = isCash ? Math.max((tienKhachDua as number) - tongTien, 0) : 0;
    const maNguoiDung = dto.ma_nguoi_dung?.trim() || `guest-pos-${Date.now()}`;
    const maDonHang = crypto.randomUUID();

    const trangThaiDon = 'MOI_TAO';
    const trangThaiThanhToan = isCash ? 'CHO_THANH_TOAN_KHI_NHAN_HANG' : 'CHO_XU_LY';
    const diaChi = loaiDon === 'TAI_CHO' ? `Tai quay${dto.ma_ban?.trim() ? ` - Ban ${dto.ma_ban.trim()}` : ''}` : 'Mang di tai quay';

    const taoDonResult = await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const chiTietRepo = manager.getRepository(ChiTietDonHang);
      const giaoDichRepo = manager.getRepository(GiaoDichThanhToan);

      const donHang = await donHangRepo.save(
        donHangRepo.create({
          ma_don_hang: maDonHang,
          ma_nguoi_dung: maNguoiDung,
          co_so_ma: branchCode,
          tong_tien: tongTien,
          ma_voucher: null,
          so_tien_giam: 0,
          dia_chi_giao_hang: diaChi,
          khung_gio_giao: null,
          ghi_chu: dto.ghi_chu?.trim() ? dto.ghi_chu.trim() : null,
          loai_don_hang: loaiDon,
          ma_ban: dto.ma_ban?.trim() ? dto.ma_ban.trim() : null,
          ten_khach_hang: dto.ten_khach_hang?.trim() ? dto.ten_khach_hang.trim() : null,
          ten_thu_ngan: dto.ten_thu_ngan?.trim() ? dto.ten_thu_ngan.trim() : null,
          phuong_thuc_thanh_toan: phuongThuc,
          trang_thai_thanh_toan: trangThaiThanhToan,
          trang_thai_don_hang: trangThaiDon,
          tien_khach_dua: tienKhachDua,
          tien_thoi: tienThoi,
          lich_su_trang_thai: [
            {
              loai: 'ORDER',
              trang_thai: trangThaiDon,
              thoi_gian: new Date().toISOString(),
              ghi_chu: 'Tao don tai quay',
            },
            {
              loai: 'PAYMENT',
              trang_thai: trangThaiThanhToan,
              thoi_gian: new Date().toISOString(),
              ghi_chu: 'Khoi tao thanh toan POS',
            },
          ],
        }),
      );

      const chiTiet = normalizedItems.map((item) =>
        chiTietRepo.create({
          ma_don_hang: donHang.ma_don_hang,
          ma_san_pham: item.ma_san_pham,
          ten_san_pham: item.ten_san_pham,
          gia_ban: item.gia_ban,
          so_luong: item.so_luong,
          kich_co: null,
          hinh_anh_url: null,
        }),
      );
      const chiTietSaved = await chiTietRepo.save(chiTiet);

      const maThamChieu = phuongThuc === 'VNPAY'
        ? `${donHang.ma_don_hang}_${Date.now()}`
        : this.taoMaThamChieu(phuongThuc, donHang.ma_don_hang);

      const giaoDich = await giaoDichRepo.save(
        giaoDichRepo.create({
          ma_don_hang: donHang.ma_don_hang,
          cong_thanh_toan: phuongThuc,
          ma_tham_chieu: maThamChieu,
          so_tien: tongTien,
          trang_thai: 'CHO_THANH_TOAN',
        }),
      );

      return { donHang, chiTiet: chiTietSaved, giaoDich, maThamChieu };
    });

    const { donHang, chiTiet, giaoDich, maThamChieu } = taoDonResult;
  await this.invalidateOrderCaches(maNguoiDung, branchCode);
  await this.publishOrderCreatedEvent(donHang);

    const orderData = {
      ma_don_hang: donHang.ma_don_hang,
      ma_nguoi_dung: donHang.ma_nguoi_dung,
      co_so_ma: donHang.co_so_ma,
      tong_tien: Number(donHang.tong_tien),
      ma_voucher: donHang.ma_voucher || null,
      so_tien_giam: Number(donHang.so_tien_giam || 0),
      dia_chi_giao_hang: donHang.dia_chi_giao_hang,
      khung_gio_giao: donHang.khung_gio_giao,
      ghi_chu: donHang.ghi_chu,
      loai_don_hang: donHang.loai_don_hang,
      ma_ban: donHang.ma_ban,
      ten_khach_hang: donHang.ten_khach_hang,
      ten_thu_ngan: donHang.ten_thu_ngan,
      phuong_thuc_thanh_toan: donHang.phuong_thuc_thanh_toan,
      trang_thai_thanh_toan: donHang.trang_thai_thanh_toan,
      trang_thai_don_hang: donHang.trang_thai_don_hang,
      tien_khach_dua: donHang.tien_khach_dua !== null ? Number(donHang.tien_khach_dua) : null,
      tien_thoi: Number(donHang.tien_thoi || 0),
      lich_su_trang_thai: this.taoLichSuTrangThaiHienThi(donHang),
      ngay_tao: donHang.ngay_tao,
      ngay_cap_nhat: donHang.ngay_cap_nhat,
      chi_tiet: chiTiet.map((ct) => ({
        id: ct.id,
        ma_san_pham: ct.ma_san_pham,
        ten_san_pham: ct.ten_san_pham,
        gia_ban: Number(ct.gia_ban),
        so_luong: ct.so_luong,
        hinh_anh_url: ct.hinh_anh_url,
      })),
      giao_dich: {
        ma_giao_dich: giaoDich.ma_giao_dich,
        cong_thanh_toan: giaoDich.cong_thanh_toan,
        ma_tham_chieu: giaoDich.ma_tham_chieu,
        ma_giao_dich_cong: giaoDich.ma_giao_dich_cong,
        so_tien: Number(giaoDich.so_tien),
        trang_thai: giaoDich.trang_thai,
        ngay_tao: giaoDich.ngay_tao,
      },
    };

    const paymentDetails = {
      ma_don_hang: donHang.ma_don_hang,
      so_tien: tongTien,
      ma_tham_chieu: maThamChieu,
      qr_img_url: this.taoQrNganHang(tongTien, maThamChieu),
    };

    if (phuongThuc === 'NGAN_HANG_QR') {
      return {
        message: 'Da tao don tai quay va khoi tao QR',
        order: orderData,
        payment_details: paymentDetails,
      };
    }

    if (phuongThuc === 'VNPAY') {
      return {
        message: 'Da tao don tai quay va khoi tao VNPAY',
        order: orderData,
        payment_details: paymentDetails,
        redirect_url: this.taoUrlVnpayThat(
          maNguoiDung,
          donHang.ma_don_hang,
          tongTien,
          maThamChieu,
          this.chuanHoaIpVnpay(ipAddr),
        ),
      };
    }

    return {
      message: 'Da tao don tai quay thanh cong',
      order: orderData,
      payment_details: paymentDetails,
    };
  }

  async layLichSuDonHang(maNguoiDung: string, boLoc: BoLocLichSuDonHang = {}) {
    const cacheKey = this.buildCustomerOrdersCacheKey(maNguoiDung, boLoc);
    const cached = await this.redisCacheService.getJson<{ total: number; orders: any[] }>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.chi_tiet', 'chi_tiet')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich')
      .where('don_hang.ma_nguoi_dung = :maNguoiDung', { maNguoiDung });

    if (boLoc.status) {
      query.andWhere('don_hang.trang_thai_don_hang = :status', { status: boLoc.status });
    }
    if (boLoc.paymentStatus) {
      query.andWhere('don_hang.trang_thai_thanh_toan = :paymentStatus', { paymentStatus: boLoc.paymentStatus });
    }
    if (boLoc.paymentMethod) {
      query.andWhere('don_hang.phuong_thuc_thanh_toan = :paymentMethod', { paymentMethod: boLoc.paymentMethod });
    }
    if (boLoc.keyword?.trim()) {
      const keywordLike = `%${boLoc.keyword.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('CAST(don_hang.ma_don_hang AS text) ILIKE :keyword', { keyword: keywordLike })
            .orWhere('don_hang.dia_chi_giao_hang ILIKE :keyword', { keyword: keywordLike })
            .orWhere('don_hang.ghi_chu ILIKE :keyword', { keyword: keywordLike })
            .orWhere('CAST(chi_tiet.ma_san_pham AS text) ILIKE :keyword', { keyword: keywordLike })
            .orWhere('chi_tiet.ten_san_pham ILIKE :keyword', { keyword: keywordLike })
            .orWhere('giao_dich.ma_tham_chieu ILIKE :keyword', { keyword: keywordLike })
            .orWhere('giao_dich.ma_giao_dich_cong ILIKE :keyword', { keyword: keywordLike });
        }),
      );
    }

    const danhSach = await query
      .orderBy('don_hang.ngay_tao', 'DESC')
      .addOrderBy('giao_dich.ngay_tao', 'DESC')
      .getMany();

    const orders = danhSach.map((don) => {
      const giaoDichSorted = [...(don.giao_dich_thanh_toan || [])].sort(
        (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
      );
      const giaoDichGanNhat = giaoDichSorted[0] || null;

      return {
        ma_don_hang: don.ma_don_hang,
        co_so_ma: don.co_so_ma,
        tong_tien: Number(don.tong_tien),
        ma_voucher: don.ma_voucher || null,
        so_tien_giam: Number(don.so_tien_giam || 0),
        dia_chi_giao_hang: don.dia_chi_giao_hang,
        khung_gio_giao: don.khung_gio_giao,
        ghi_chu: don.ghi_chu,
        loai_don_hang: don.loai_don_hang,
        ma_ban: don.ma_ban,
        ten_khach_hang: don.ten_khach_hang,
        ten_thu_ngan: don.ten_thu_ngan,
        phuong_thuc_thanh_toan: don.phuong_thuc_thanh_toan,
        trang_thai_thanh_toan: don.trang_thai_thanh_toan,
        trang_thai_don_hang: don.trang_thai_don_hang,
        tien_khach_dua: don.tien_khach_dua !== null ? Number(don.tien_khach_dua) : null,
        tien_thoi: Number(don.tien_thoi || 0),
        lich_su_trang_thai: this.taoLichSuTrangThaiHienThi(don),
        ngay_tao: don.ngay_tao,
        ngay_cap_nhat: don.ngay_cap_nhat,
        chi_tiet: (don.chi_tiet || []).map((ct) => ({
          id: ct.id,
          ma_san_pham: ct.ma_san_pham,
          ten_san_pham: ct.ten_san_pham,
          gia_ban: Number(ct.gia_ban),
          so_luong: ct.so_luong,
          hinh_anh_url: ct.hinh_anh_url,
        })),
        giao_dich: giaoDichGanNhat
          ? {
              ma_giao_dich: giaoDichGanNhat.ma_giao_dich,
              cong_thanh_toan: giaoDichGanNhat.cong_thanh_toan,
              ma_tham_chieu: giaoDichGanNhat.ma_tham_chieu,
              ma_giao_dich_cong: giaoDichGanNhat.ma_giao_dich_cong,
              so_tien: Number(giaoDichGanNhat.so_tien),
              trang_thai: giaoDichGanNhat.trang_thai,
              ngay_tao: giaoDichGanNhat.ngay_tao,
            }
          : null,
      };
    });

    const result = { total: orders.length, orders };
    await this.redisCacheService.setJson(cacheKey, result, 45);
    return result;
  }

  async layDanhSachDonHangChoStaff(boLoc: BoLocLichSuDonHang = {}) {
    const branchCode = this.normalizeBranchCode(boLoc.branchCode);
    const cacheKey = this.buildStaffOrdersCacheKey(branchCode, boLoc);
    const cached = await this.redisCacheService.getJson<{ total: number; orders: any[] }>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.chi_tiet', 'chi_tiet')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich')
      .where('don_hang.co_so_ma = :branchCode', { branchCode });

    if (boLoc.status) {
      query.andWhere('don_hang.trang_thai_don_hang = :status', { status: boLoc.status });
    }
    if (boLoc.paymentStatus) {
      query.andWhere('don_hang.trang_thai_thanh_toan = :paymentStatus', { paymentStatus: boLoc.paymentStatus });
    }
    if (boLoc.paymentMethod) {
      query.andWhere('don_hang.phuong_thuc_thanh_toan = :paymentMethod', { paymentMethod: boLoc.paymentMethod });
    }
    if (boLoc.keyword?.trim()) {
      const keywordLike = `%${boLoc.keyword.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('CAST(don_hang.ma_don_hang AS text) ILIKE :keyword', { keyword: keywordLike })
            .orWhere('CAST(don_hang.ma_nguoi_dung AS text) ILIKE :keyword', { keyword: keywordLike })
            .orWhere('don_hang.dia_chi_giao_hang ILIKE :keyword', { keyword: keywordLike })
            .orWhere('don_hang.ghi_chu ILIKE :keyword', { keyword: keywordLike })
            .orWhere('CAST(chi_tiet.ma_san_pham AS text) ILIKE :keyword', { keyword: keywordLike })
            .orWhere('chi_tiet.ten_san_pham ILIKE :keyword', { keyword: keywordLike })
            .orWhere('giao_dich.ma_tham_chieu ILIKE :keyword', { keyword: keywordLike })
            .orWhere('giao_dich.ma_giao_dich_cong ILIKE :keyword', { keyword: keywordLike });
        }),
      );
    }

    const danhSach = await query
      .orderBy('don_hang.ngay_tao', 'DESC')
      .addOrderBy('giao_dich.ngay_tao', 'DESC')
      .getMany();

    const orders = danhSach.map((don) => {
      const giaoDichSorted = [...(don.giao_dich_thanh_toan || [])].sort(
        (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
      );
      const giaoDichGanNhat = giaoDichSorted[0] || null;

      return {
        ma_don_hang: don.ma_don_hang,
        ma_nguoi_dung: don.ma_nguoi_dung,
        co_so_ma: don.co_so_ma,
        tong_tien: Number(don.tong_tien),
        ma_voucher: don.ma_voucher || null,
        so_tien_giam: Number(don.so_tien_giam || 0),
        dia_chi_giao_hang: don.dia_chi_giao_hang,
        khung_gio_giao: don.khung_gio_giao,
        ghi_chu: don.ghi_chu,
        loai_don_hang: don.loai_don_hang,
        ma_ban: don.ma_ban,
        ten_khach_hang: don.ten_khach_hang,
        ten_thu_ngan: don.ten_thu_ngan,
        phuong_thuc_thanh_toan: don.phuong_thuc_thanh_toan,
        trang_thai_thanh_toan: don.trang_thai_thanh_toan,
        trang_thai_don_hang: don.trang_thai_don_hang,
        tien_khach_dua: don.tien_khach_dua !== null ? Number(don.tien_khach_dua) : null,
        tien_thoi: Number(don.tien_thoi || 0),
        lich_su_trang_thai: this.taoLichSuTrangThaiHienThi(don),
        ngay_tao: don.ngay_tao,
        ngay_cap_nhat: don.ngay_cap_nhat,
        chi_tiet: (don.chi_tiet || []).map((ct) => ({
          id: ct.id,
          ma_san_pham: ct.ma_san_pham,
          ten_san_pham: ct.ten_san_pham,
          gia_ban: Number(ct.gia_ban),
          so_luong: ct.so_luong,
          hinh_anh_url: ct.hinh_anh_url,
        })),
        giao_dich: giaoDichGanNhat
          ? {
              ma_giao_dich: giaoDichGanNhat.ma_giao_dich,
              cong_thanh_toan: giaoDichGanNhat.cong_thanh_toan,
              ma_tham_chieu: giaoDichGanNhat.ma_tham_chieu,
              ma_giao_dich_cong: giaoDichGanNhat.ma_giao_dich_cong,
              so_tien: Number(giaoDichGanNhat.so_tien),
              trang_thai: giaoDichGanNhat.trang_thai,
              ngay_tao: giaoDichGanNhat.ngay_tao,
            }
          : null,
      };
    });

    const result = { total: orders.length, orders };
    await this.redisCacheService.setJson(cacheKey, result, 30);
    return result;
  }

  private layKhungCaLamViec(code: TaoLichLamViecInput['shift_code']) {
    const normalizedCode = String(code || '').trim().toUpperCase();

    const slotsByCode: Record<'SANG' | 'CHIEU' | 'TOI', { ten_ca: string; gio_bat_dau: string; gio_ket_thuc: string }> = {
      SANG: { ten_ca: 'Ca sang', gio_bat_dau: '07:00', gio_ket_thuc: '12:00' },
      CHIEU: { ten_ca: 'Ca chieu', gio_bat_dau: '12:00', gio_ket_thuc: '17:00' },
      TOI: { ten_ca: 'Ca toi', gio_bat_dau: '17:00', gio_ket_thuc: '22:00' },
    };

    return slotsByCode[normalizedCode as 'SANG' | 'CHIEU' | 'TOI'] || null;
  }

  private dinhDangCaLamViec(ca: CaLamViecNhanVien) {
    return {
      ma_ca_lam_viec: ca.ma_ca_lam_viec,
      co_so_ma: ca.co_so_ma,
      staff_username: ca.staff_username,
      staff_name: ca.staff_name,
      ngay_lam_viec: ca.ngay_lam_viec,
      ma_khung_ca: ca.ma_khung_ca,
      ten_ca: ca.ten_ca,
      gio_bat_dau: ca.gio_bat_dau,
      gio_ket_thuc: ca.gio_ket_thuc,
      so_gio_ca: this.tinhSoGioCa(ca.gio_bat_dau, ca.gio_ket_thuc),
      trang_thai_cham_cong: ca.trang_thai_cham_cong,
      check_in_at: ca.check_in_at,
      check_out_at: ca.check_out_at,
      note: ca.note,
      manager_username: ca.manager_username,
      ngay_tao: ca.ngay_tao,
      ngay_cap_nhat: ca.ngay_cap_nhat,
    };
  }

  private dinhDangCaDoiSoat(ca: CaDoiSoat) {
    const summary = ca.du_lieu_tom_tat || {};
    return {
      ma_ca: ca.ma_ca,
      co_so_ma: ca.co_so_ma,
      shift_date: summary?.shift_date || this.toVnDateKey(ca.thoi_gian_bat_dau),
      from: ca.thoi_gian_bat_dau,
      to: ca.thoi_gian_ket_thuc,
      cash_open: Number(ca.tien_dau_ca),
      cash_close: Number(ca.tien_cuoi_ca),
      expected_cash_close: Number(ca.tien_mat_ky_vong),
      cash_revenue: Number(ca.tien_mat_he_thong),
      total_revenue: Number(ca.doanh_thu_he_thong),
      cash_in_gross: Number(summary?.cash_in_gross || ca.tien_mat_he_thong),
      cash_change_out: Number(summary?.cash_change_out || 0),
      cash_net: Number(summary?.cash_net || ca.tien_mat_he_thong),
      non_cash_revenue: Number(summary?.non_cash_revenue || 0),
      online_revenue: Number(summary?.online_revenue || 0),
      in_store_revenue: Number(summary?.in_store_revenue || 0),
      difference: Number(ca.chenh_lech),
      total_orders: ca.tong_don,
      cash_orders: ca.tong_don_tien_mat,
      note: ca.ghi_chu,
      staff_name: ca.ten_nhan_vien,
      approval_status: ca.trang_thai_phe_duyet || 'PENDING',
      approved_by: ca.manager_duyet,
      approval_note: ca.ghi_chu_phe_duyet,
      approved_at: ca.thoi_gian_phe_duyet,
      created_at: ca.ngay_tao,
    };
  }

  private tinhSoGioCa(gioBatDau: string, gioKetThuc: string) {
    const parseMinute = (value: string) => {
      const [h, m] = String(value || '').split(':').map((part) => Number(part));
      return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
    };

    const diff = parseMinute(gioKetThuc) - parseMinute(gioBatDau);
    return Number((Math.max(diff, 0) / 60).toFixed(2));
  }

  // --- HELPERS ---
  private formatVnpDate(date: Date) {
    const vnTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const f = (n: number) => String(n).padStart(2, '0');
    return `${vnTime.getUTCFullYear()}${f(vnTime.getUTCMonth() + 1)}${f(vnTime.getUTCDate())}${f(vnTime.getUTCHours())}${f(vnTime.getUTCMinutes())}${f(vnTime.getUTCSeconds())}`;
  }

  private chuanHoaIpVnpay(ipAddr: string) {
    if (!ipAddr) return '127.0.0.1';
    if (ipAddr.includes(',')) return ipAddr.split(',')[0].trim();
    if (ipAddr === '::1') return '127.0.0.1';
    if (ipAddr.startsWith('::ffff:')) return ipAddr.replace('::ffff:', '');
    return ipAddr;
  }

  private taoMaThamChieu(cong: string, maDonHang: string) {
    const prefix = cong === 'NGAN_HANG_QR' ? 'QR' : 'COD';
    return `${prefix}-${maDonHang.slice(0, 8)}-${Date.now().toString().slice(-6)}`;
  }

  private taoQrNganHang(tongTien: number, maThamChieu: string) {
    const amount = Math.round(tongTien);
    return `https://qr.sepay.vn/img?bank=${encodeURIComponent(this.SEPAY_BANK_CODE)}&acc=${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}&template=compact&amount=${amount}&des=${encodeURIComponent(maThamChieu)}`;
  }

  private trichXuatMaThamChieuQr(noiDung: string) {
    const matched = noiDung.match(/QR[A-Za-z0-9-]+/);
    return matched?.[0] || null;
  }

  async layTrangThaiDonHang(maNguoiDung: string, maDonHang: string) {
    return await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung } });
  }

  async capNhatThongTinDonHang(maNguoiDung: string, maDonHang: string, dto: CapNhatDonHangDto) {
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung },
      relations: ['chi_tiet', 'giao_dich_thanh_toan'],
    });

    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    if (donHang.trang_thai_don_hang !== 'MOI_TAO') {
      throw new BadRequestException('Chi co the sua don khi don dang o trang thai moi tao');
    }

    if (donHang.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
      throw new BadRequestException('Hien chi ho tro sua don COD truoc khi cua hang xac nhan');
    }

    const chiTietHienTai = Array.isArray(donHang.chi_tiet) ? [...donHang.chi_tiet] : [];
    if (!chiTietHienTai.length) {
      throw new BadRequestException('Don hang khong co san pham de cap nhat');
    }

    const itemUpdates = new Map((dto.items || []).map((item) => [Number(item.id), Number(item.so_luong)]));
    const chiTietCapNhat = chiTietHienTai
      .map((item) => {
        if (!itemUpdates.has(item.id)) {
          return item;
        }

        return {
          ...item,
          so_luong: itemUpdates.get(item.id) || 0,
        };
      })
      .filter((item) => item.so_luong > 0);

    if (!chiTietCapNhat.length) {
      throw new BadRequestException('Don hang phai con it nhat 1 san pham. Neu khong muon nhan don, vui long huy don.');
    }

    const tongTienMoi = chiTietCapNhat.reduce((sum, item) => sum + Number(item.gia_ban) * item.so_luong, 0);
    const giaoDichMoiNhat = [...(donHang.giao_dich_thanh_toan || [])].sort(
      (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
    )[0];

    const ketQua = await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const chiTietRepo = manager.getRepository(ChiTietDonHang);
      const giaoDichRepo = manager.getRepository(GiaoDichThanhToan);

      const chiTietCanXoa = chiTietHienTai.filter((item) => itemUpdates.has(item.id) && (itemUpdates.get(item.id) || 0) <= 0);
      if (chiTietCanXoa.length) {
        await chiTietRepo.remove(chiTietCanXoa);
      }

      await chiTietRepo.save(chiTietCapNhat);

      if (dto.dia_chi_giao_hang !== undefined) {
        if (!dto.dia_chi_giao_hang.trim()) {
          throw new BadRequestException('dia_chi_giao_hang khong duoc de trong');
        }
        donHang.dia_chi_giao_hang = dto.dia_chi_giao_hang.trim();
      }

      if (dto.khung_gio_giao !== undefined) {
        donHang.khung_gio_giao = dto.khung_gio_giao?.trim() ? dto.khung_gio_giao.trim() : null;
      }

      if (dto.ghi_chu !== undefined) {
        donHang.ghi_chu = dto.ghi_chu?.trim() ? dto.ghi_chu.trim() : null;
      }

      donHang.tong_tien = tongTienMoi;
      donHang.ngay_cap_nhat = new Date();

      const donHangDaLuu = await donHangRepo.save(donHang);

      if (giaoDichMoiNhat) {
        giaoDichMoiNhat.so_tien = tongTienMoi;
        await giaoDichRepo.save(giaoDichMoiNhat);
      }

      return donHangRepo.findOne({
        where: { ma_don_hang: donHangDaLuu.ma_don_hang },
        relations: ['chi_tiet', 'giao_dich_thanh_toan'],
      });
    });

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Don hang da duoc cap nhat',
      noi_dung: `Don #${maDonHang} da duoc chinh sua truoc khi xac nhan.`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: 'MOI_TAO' },
    });
    await this.invalidateOrderCaches(maNguoiDung, donHang.co_so_ma);

    return {
      message: 'Cap nhat don hang thanh cong',
      order: ketQua,
    };
  }

  async capNhatThongTinDonHangChoStaff(
    maDonHang: string,
    branchCodeRaw: string | undefined,
    dto: CapNhatDonHangChoStaffDto,
  ) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang, co_so_ma: branchCode },
      relations: ['chi_tiet', 'giao_dich_thanh_toan'],
    });

    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    if (donHang.trang_thai_don_hang !== 'MOI_TAO') {
      throw new BadRequestException('Chi co the sua don khi don dang o trang thai moi tao');
    }

    if (donHang.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
      throw new BadRequestException('Hien chi ho tro sua don COD truoc khi cua hang xac nhan');
    }

    const rawItems = Array.isArray(dto.items) ? dto.items : [];
    if (!rawItems.length) {
      throw new BadRequestException('Don hang phai co it nhat 1 mon');
    }

    const mergeByProduct = new Map<number, { ma_san_pham: number; ten_san_pham: string; so_luong: number; gia_ban: number }>();

    for (const item of rawItems) {
      const maSanPham = Number(item.ma_san_pham);
      const tenSanPham = String(item.ten_san_pham || '').trim();
      const soLuong = Number(item.so_luong);
      const giaBan = Number(item.gia_ban);

      if (Number.isNaN(maSanPham) || !tenSanPham || Number.isNaN(soLuong) || soLuong <= 0 || Number.isNaN(giaBan) || giaBan < 0) {
        throw new BadRequestException('Du lieu mon trong don khong hop le');
      }

      const existed = mergeByProduct.get(maSanPham);
      if (existed) {
        existed.so_luong += soLuong;
      } else {
        mergeByProduct.set(maSanPham, {
          ma_san_pham: maSanPham,
          ten_san_pham: tenSanPham,
          so_luong: soLuong,
          gia_ban: giaBan,
        });
      }
    }

    const normalizedItems = Array.from(mergeByProduct.values());
    const tongTienMoi = normalizedItems.reduce((sum, item) => sum + item.gia_ban * item.so_luong, 0);
    const giaoDichMoiNhat = [...(donHang.giao_dich_thanh_toan || [])].sort(
      (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
    )[0];

    const ketQua = await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const chiTietRepo = manager.getRepository(ChiTietDonHang);
      const giaoDichRepo = manager.getRepository(GiaoDichThanhToan);

      await chiTietRepo.delete({ ma_don_hang: donHang.ma_don_hang });

      const chiTietMoi = normalizedItems.map((item) =>
        chiTietRepo.create({
          ma_don_hang: donHang.ma_don_hang,
          ma_san_pham: item.ma_san_pham,
          ten_san_pham: item.ten_san_pham,
          gia_ban: item.gia_ban,
          so_luong: item.so_luong,
          kich_co: null,
          hinh_anh_url: null,
        }),
      );
      await chiTietRepo.save(chiTietMoi);

      if (dto.dia_chi_giao_hang !== undefined) {
        if (!dto.dia_chi_giao_hang.trim()) {
          throw new BadRequestException('dia_chi_giao_hang khong duoc de trong');
        }
        donHang.dia_chi_giao_hang = dto.dia_chi_giao_hang.trim();
      }

      if (dto.khung_gio_giao !== undefined) {
        donHang.khung_gio_giao = dto.khung_gio_giao?.trim() ? dto.khung_gio_giao.trim() : null;
      }

      if (dto.ghi_chu !== undefined) {
        donHang.ghi_chu = dto.ghi_chu?.trim() ? dto.ghi_chu.trim() : null;
      }

      if (dto.ten_khach_hang !== undefined) {
        donHang.ten_khach_hang = dto.ten_khach_hang?.trim() ? dto.ten_khach_hang.trim() : null;
      }

      if (dto.ma_ban !== undefined) {
        donHang.ma_ban = dto.ma_ban?.trim() ? dto.ma_ban.trim() : null;
      }

      if (dto.tien_khach_dua !== undefined) {
        const tienKhachDua = Number(dto.tien_khach_dua);
        if (Number.isNaN(tienKhachDua) || tienKhachDua < tongTienMoi) {
          throw new BadRequestException('Tien khach dua khong hop le hoac chua du');
        }
        donHang.tien_khach_dua = tienKhachDua;
        donHang.tien_thoi = Math.max(tienKhachDua - tongTienMoi, 0);
      } else if (donHang.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
        const fallbackCash = Number(donHang.tien_khach_dua || tongTienMoi);
        donHang.tien_khach_dua = Math.max(fallbackCash, tongTienMoi);
        donHang.tien_thoi = Math.max(Number(donHang.tien_khach_dua) - tongTienMoi, 0);
      }

      const lichSu: LichSuTrangThai[] = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
      lichSu.push({
        loai: 'ORDER',
        trang_thai: donHang.trang_thai_don_hang,
        thoi_gian: new Date().toISOString(),
        ghi_chu: 'Staff cap nhat thong tin va chi tiet don hang',
      });

      const updatePayload: Partial<DonHang> = {
        tong_tien: tongTienMoi,
        lich_su_trang_thai: lichSu,
        ngay_cap_nhat: new Date(),
        tien_khach_dua: donHang.tien_khach_dua,
        tien_thoi: donHang.tien_thoi,
      };

      if (dto.dia_chi_giao_hang !== undefined) {
        updatePayload.dia_chi_giao_hang = donHang.dia_chi_giao_hang;
      }
      if (dto.khung_gio_giao !== undefined) {
        updatePayload.khung_gio_giao = donHang.khung_gio_giao;
      }
      if (dto.ghi_chu !== undefined) {
        updatePayload.ghi_chu = donHang.ghi_chu;
      }
      if (dto.ten_khach_hang !== undefined) {
        updatePayload.ten_khach_hang = donHang.ten_khach_hang;
      }
      if (dto.ma_ban !== undefined) {
        updatePayload.ma_ban = donHang.ma_ban;
      }

      await donHangRepo.update({ ma_don_hang: donHang.ma_don_hang }, updatePayload);

      if (giaoDichMoiNhat) {
        giaoDichMoiNhat.so_tien = tongTienMoi;
        await giaoDichRepo.save(giaoDichMoiNhat);
      }

      return donHangRepo.findOne({
        where: { ma_don_hang: donHang.ma_don_hang },
        relations: ['chi_tiet', 'giao_dich_thanh_toan'],
      });
    });

    await this.invalidateOrderCaches(donHang.ma_nguoi_dung, donHang.co_so_ma);

    return {
      message: 'Cap nhat don hang thanh cong',
      order: ketQua,
    };
  }

  async xoaDonHangChoStaff(maDonHang: string, branchCodeRaw?: string, lyDo?: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang, co_so_ma: branchCode },
    });

    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    if (!['MOI_TAO', 'DA_HUY'].includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException('Chi co the xoa don o trang thai moi tao hoac da huy');
    }

    if (donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
      throw new BadRequestException('Khong the xoa don da thanh toan');
    }

    await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const orderToDelete = await donHangRepo.findOne({ where: { ma_don_hang: maDonHang, co_so_ma: branchCode } });
      if (!orderToDelete) {
        throw new NotFoundException('Khong tim thay don hang');
      }
      await donHangRepo.remove(orderToDelete);
    });
    await this.invalidateOrderCaches(donHang.ma_nguoi_dung, donHang.co_so_ma);

    return {
      message: lyDo?.trim() ? `Xoa don thanh cong: ${lyDo.trim()}` : 'Xoa don thanh cong',
      ma_don_hang: maDonHang,
    };
  }

  async huyDonHang(maNguoiDung: string, maDonHang: string, lyDo?: string) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }
    if (!['MOI_TAO', 'DA_XAC_NHAN'].includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException('Chi duoc huy don o trang thai moi tao hoac da xac nhan');
    }

    const updated = await this.capNhatTrangThaiDonHangHeThong(maDonHang, {
      trang_thai_don_hang: 'DA_HUY',
      trang_thai_thanh_toan:
        donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN' ? donHang.trang_thai_thanh_toan : 'THAT_BAI',
      ghi_chu: lyDo?.trim() || 'Khach hang huy don',
    });

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Don hang da huy',
      noi_dung: `Don #${maDonHang} da duoc huy.`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: 'DA_HUY' },
    });

    return { message: 'Huy don thanh cong', order: updated };
  }

  async capNhatTrangThaiDonHang(maNguoiDung: string, maDonHang: string, trangThai: string) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const allowed = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH', 'DA_HUY'];
    if (!allowed.includes(trangThai)) {
      throw new BadRequestException('Trang thai don hang khong hop le');
    }

    if (!this.kiemTraChuyenTrangThaiDonHopLe(donHang.trang_thai_don_hang, trangThai)) {
      throw new BadRequestException(`Khong the chuyen trang thai tu ${donHang.trang_thai_don_hang} sang ${trangThai}`);
    }

    const updated = await this.capNhatTrangThaiDonHangHeThong(maDonHang, {
      trang_thai_don_hang: trangThai,
      ghi_chu: 'Cap nhat trang thai don hang',
    });

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Cap nhat trang thai don hang',
      noi_dung: `Don #${maDonHang} da chuyen sang trang thai ${trangThai}.`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: trangThai },
    });

    return { message: 'Cap nhat trang thai thanh cong', order: updated };
  }

  async capNhatTrangThaiDonHangChoStaff(maDonHang: string, trangThai: string, branchCodeRaw?: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, co_so_ma: branchCode } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const allowed = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH', 'DA_HUY'];
    if (!allowed.includes(trangThai)) {
      throw new BadRequestException('Trang thai don hang khong hop le');
    }

    if (!this.kiemTraChuyenTrangThaiDonHopLe(donHang.trang_thai_don_hang, trangThai)) {
      throw new BadRequestException(`Khong the chuyen trang thai tu ${donHang.trang_thai_don_hang} sang ${trangThai}`);
    }

    const paymentUpdate = this.xacDinhTrangThaiThanhToanTheoTrangThaiDon(donHang, trangThai);

    const updated = await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const giaoDichRepo = manager.getRepository(GiaoDichThanhToan);

      const savedOrder = await this.capNhatTrangThaiDonHangHeThong(maDonHang, {
        trang_thai_don_hang: trangThai,
        trang_thai_thanh_toan: paymentUpdate.orderPaymentStatus,
        ghi_chu: 'Nhan vien cua hang cap nhat trang thai',
      }, manager);

      if (
        trangThai === 'HOAN_THANH' &&
        savedOrder.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' &&
        (savedOrder.tien_khach_dua === null || savedOrder.tien_khach_dua === undefined)
      ) {
        savedOrder.tien_khach_dua = Number(savedOrder.tong_tien || 0);
        savedOrder.tien_thoi = 0;
        await donHangRepo.save(savedOrder);
      }

      if (paymentUpdate.transactionStatus) {
        const latestTxn = await giaoDichRepo.findOne({
          where: { ma_don_hang: maDonHang },
          order: { ngay_tao: 'DESC' },
        });

        if (latestTxn && latestTxn.trang_thai !== paymentUpdate.transactionStatus) {
          latestTxn.trang_thai = paymentUpdate.transactionStatus;
          await giaoDichRepo.save(latestTxn);
        }
      }

      return donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    });

    if (!updated) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: donHang.ma_nguoi_dung,
      tieu_de: 'Cap nhat trang thai don hang',
      noi_dung: `Don #${maDonHang} da chuyen sang trang thai ${trangThai}.`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: trangThai },
    });

    return { message: 'Cap nhat trang thai thanh cong', order: updated };
  }

  // Tích điểm loyalty cho user (fire-and-forget — không làm hỏng luồng thanh toán)
  private async tichDiemLoyalty(maNguoiDung: string, tongTienGoc: number): Promise<void> {
    if (!maNguoiDung || maNguoiDung.startsWith('guest-')) return;
    const diem = Math.floor(tongTienGoc / 1000);
    if (diem <= 0) return;
    try {
      const url = `${this.IDENTITY_SERVICE_URL}/users/${maNguoiDung}/loyalty/cong-diem`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify({ diem }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Không throw — lỗi loyalty không được ảnh hưởng đến thanh toán
    }
  }

  private taoLichSuTrangThaiHienThi(donHang: DonHang): LichSuTrangThai[] {
    const lichSu = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
    if (lichSu.length > 0) {
      return lichSu;
    }

    const mocThoiGian = donHang.ngay_cap_nhat || donHang.ngay_tao || new Date();
    return [
      {
        loai: 'ORDER',
        trang_thai: donHang.trang_thai_don_hang,
        thoi_gian: mocThoiGian.toISOString(),
        ghi_chu: 'Du lieu cu duoc dong bo tu trang thai hien tai',
      },
      {
        loai: 'PAYMENT',
        trang_thai: donHang.trang_thai_thanh_toan,
        thoi_gian: mocThoiGian.toISOString(),
        ghi_chu: 'Du lieu cu duoc dong bo tu trang thai hien tai',
      },
    ];
  }

  private chuanHoaKhoangThoiGian(from?: string, to?: string) {
    const now = new Date();
    const macDinhBatDau = new Date(now);
    macDinhBatDau.setHours(0, 0, 0, 0);

    const parsedFrom = from ? new Date(from) : macDinhBatDau;
    const parsedTo = to ? new Date(to) : now;

    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
      throw new BadRequestException('Khoang thoi gian khong hop le');
    }

    if (parsedFrom >= parsedTo) {
      throw new BadRequestException('thoi_gian_bat_dau phai nho hon thoi_gian_ket_thuc');
    }

    return {
      from: parsedFrom,
      to: parsedTo,
    };
  }

  private chuanHoaSoTien(raw: string | number | undefined, fallback: number) {
    const value = Number(raw);
    if (Number.isNaN(value)) return fallback;
    if (value < 0) {
      throw new BadRequestException('So tien phai >= 0');
    }
    return Math.round(value);
  }

  private async tinhTongHopDoiSoat(from: Date, to: Date, branchCode: string) {
    const danhSach = await this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich')
      .where('don_hang.ngay_tao >= :from', { from: from.toISOString() })
      .andWhere('don_hang.ngay_tao <= :to', { to: to.toISOString() })
      .andWhere('don_hang.co_so_ma = :branchCode', { branchCode })
      .orderBy('don_hang.ngay_tao', 'ASC')
      .addOrderBy('giao_dich.ngay_tao', 'DESC')
      .getMany();

    let doanhThuDonHoanThanh = 0;
    let doanhThuKhongTienMat = 0;
    let doanhThuOnline = 0;
    let doanhThuTaiShop = 0;
    let tienMatThuVao = 0;
    let tienThoi = 0;
    let tienMatThucThu = 0;
    let tongDonTienMat = 0;
    let tongDonHopLe = 0;

    danhSach.forEach((order) => {
      const completedAt = this.layThoiGianHoanThanhDon(order);
      if (!completedAt) {
        return;
      }

      const createdAt = new Date(order.ngay_tao);
      if (Number.isNaN(createdAt.getTime())) {
        return;
      }

      if (createdAt < from || createdAt > to || completedAt < from || completedAt > to) {
        return;
      }

      const tongTien = Number(order.tong_tien || 0);
      tongDonHopLe += 1;
      doanhThuDonHoanThanh += tongTien;

      const laDonTaiShop = ['TAI_CHO', 'MANG_DI'].includes(String(order.loai_don_hang || '').toUpperCase());
      if (laDonTaiShop) {
        doanhThuTaiShop += tongTien;
      } else {
        doanhThuOnline += tongTien;
      }

      if (order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
        doanhThuKhongTienMat += tongTien;
        return;
      }

      const giaoDich = [...(order.giao_dich_thanh_toan || [])].sort(
        (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
      )[0];
      const daThuTien =
        giaoDich?.trang_thai === 'THANH_CONG' ||
        order.trang_thai_thanh_toan === 'DA_THANH_TOAN' ||
        order.trang_thai_thanh_toan === 'CHO_THANH_TOAN_KHI_NHAN_HANG';

      if (!daThuTien) {
        return;
      }

      tongDonTienMat += 1;
      const tienKhachDua = Number(order.tien_khach_dua ?? tongTien);
      const tienThoiDon = Number(order.tien_thoi ?? Math.max(tienKhachDua - tongTien, 0));
      const tienThuVaoDon = Math.max(tienKhachDua, tongTien);
      const tienThoiHopLe = Math.max(tienThoiDon, 0);

      tienMatThuVao += tienThuVaoDon;
      tienThoi += tienThoiHopLe;
      tienMatThucThu += Math.max(tienThuVaoDon - tienThoiHopLe, 0);
    });

    return {
      tongDon: tongDonHopLe,
      tongDonTienMat,
      doanhThuDonHoanThanh: Math.round(doanhThuDonHoanThanh),
      doanhThuKhongTienMat: Math.round(doanhThuKhongTienMat),
      doanhThuOnline: Math.round(doanhThuOnline),
      doanhThuTaiShop: Math.round(doanhThuTaiShop),
      tienMatThuVao: Math.round(tienMatThuVao),
      tienThoi: Math.round(tienThoi),
      tienMatThucThu: Math.round(tienMatThucThu),
    };
  }

  private kiemTraChuyenTrangThaiDonHopLe(currentStatus: string, nextStatus: string) {
    if (currentStatus === nextStatus) {
      return true;
    }

    const transitions: Record<string, string[]> = {
      MOI_TAO: ['DA_XAC_NHAN', 'DA_HUY'],
      DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DA_HUY'],
      DANG_CHUAN_BI: ['DANG_GIAO', 'HOAN_THANH', 'DA_HUY'],
      DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
      HOAN_THANH: [],
      DA_HUY: [],
    };

    return transitions[currentStatus]?.includes(nextStatus) ?? false;
  }

  private xacDinhTrangThaiThanhToanTheoTrangThaiDon(donHang: DonHang, nextOrderStatus: string) {
    if (nextOrderStatus === 'HOAN_THANH' && donHang.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
      return {
        orderPaymentStatus: 'DA_THANH_TOAN',
        transactionStatus: 'THANH_CONG',
      };
    }

    if (nextOrderStatus === 'DA_HUY' && donHang.trang_thai_thanh_toan !== 'DA_THANH_TOAN') {
      return {
        orderPaymentStatus: 'THAT_BAI',
        transactionStatus: 'THAT_BAI',
      };
    }

    return {
      orderPaymentStatus: undefined,
      transactionStatus: undefined,
    };
  }

  private async capNhatTrangThaiDonHangHeThong(
    maDonHang: string,
    payload: { trang_thai_don_hang?: string; trang_thai_thanh_toan?: string; ghi_chu?: string },
    entityManager?: EntityManager,
  ) {
    const donHangRepo = entityManager ? entityManager.getRepository(DonHang) : this.donHangRepo;
    const donHang = await donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const lichSu: LichSuTrangThai[] = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
    const now = new Date().toISOString();
    let orderStatusChanged = false;
    let paymentStatusChanged = false;

    if (payload.trang_thai_don_hang && payload.trang_thai_don_hang !== donHang.trang_thai_don_hang) {
      donHang.trang_thai_don_hang = payload.trang_thai_don_hang;
      lichSu.push({ loai: 'ORDER', trang_thai: payload.trang_thai_don_hang, thoi_gian: now, ghi_chu: payload.ghi_chu });
      orderStatusChanged = true;
    }

    if (payload.trang_thai_thanh_toan && payload.trang_thai_thanh_toan !== donHang.trang_thai_thanh_toan) {
      donHang.trang_thai_thanh_toan = payload.trang_thai_thanh_toan;
      lichSu.push({ loai: 'PAYMENT', trang_thai: payload.trang_thai_thanh_toan, thoi_gian: now, ghi_chu: payload.ghi_chu });
      paymentStatusChanged = true;
    }

    donHang.lich_su_trang_thai = lichSu;
    const saved = await donHangRepo.save(donHang);

    if (!entityManager) {
      await this.invalidateOrderCaches(saved.ma_nguoi_dung, saved.co_so_ma);

      if (orderStatusChanged) {
        await this.rabbitMqService.publish('order.status.changed', {
          orderId: saved.ma_don_hang,
          userId: saved.ma_nguoi_dung,
          branchCode: saved.co_so_ma,
          totalAmount: Number(saved.tong_tien || 0),
          status: saved.trang_thai_don_hang,
        });
      }

      if (paymentStatusChanged && saved.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
        await this.rabbitMqService.publish('payment.succeeded', {
          orderId: saved.ma_don_hang,
          userId: saved.ma_nguoi_dung,
          branchCode: saved.co_so_ma,
          totalAmount: Number(saved.tong_tien || 0),
          status: saved.trang_thai_thanh_toan,
        });
      }
    }

    return saved;
  }

  taoUrlRedirectFrontEnd(maNguoiDung: string, maDonHang: string, thanhCong: boolean) {
    const webBase = process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
    return `${webBase}/?payment_status=${thanhCong ? 'success' : 'failed'}&ma_don_hang=${maDonHang}`;
  }
}