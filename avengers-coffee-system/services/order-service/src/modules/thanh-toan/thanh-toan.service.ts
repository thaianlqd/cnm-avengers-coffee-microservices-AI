import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CartItem } from '../cart/cart.entity';
import { NotificationService } from '../notification/notification.service';
import { VoucherService } from '../voucher/voucher.service';
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
};

type TaoDonTaiQuayDto = {
  ma_nguoi_dung?: string;
  ten_khach_hang?: string;
  ten_thu_ngan?: string;
  loai_don_hang: 'TAI_CHO' | 'MANG_DI';
  ma_ban?: string;
  ghi_chu?: string;
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
};

type LichSuTrangThai = {
  loai: 'ORDER' | 'PAYMENT';
  trang_thai: string;
  thoi_gian: string;
  ghi_chu?: string;
};

type DoiSoatPreviewInput = {
  from?: string;
  to?: string;
  cashOpen?: string;
  cashClose?: string;
};

type ChotCaInput = {
  from: string;
  to: string;
  cash_open: number;
  cash_close: number;
  note?: string;
  staff_name?: string;
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
    private readonly notificationService: NotificationService,
    private readonly voucherService: VoucherService,
  ) {}

  async xemTruocDoiSoatCa(input: DoiSoatPreviewInput) {
    const khoang = this.chuanHoaKhoangThoiGian(input.from, input.to);
    const tongHop = await this.tinhTongHopDoiSoat(khoang.from, khoang.to);
    const tienDauCa = this.chuanHoaSoTien(input.cashOpen, 0);
    const tienCuoiCa = input.cashClose === undefined ? null : this.chuanHoaSoTien(input.cashClose, 0);
    const tienMatKyVong = tienDauCa + tongHop.tienMatHeThong;
    const chenhLech = tienCuoiCa === null ? null : tienCuoiCa - tienMatKyVong;

    return {
      range: {
        from: khoang.from.toISOString(),
        to: khoang.to.toISOString(),
      },
      system: {
        total_orders: tongHop.tongDon,
        total_revenue: tongHop.doanhThuHeThong,
        cash_orders: tongHop.tongDonTienMat,
        cash_revenue: tongHop.tienMatHeThong,
        non_cash_revenue: tongHop.doanhThuHeThong - tongHop.tienMatHeThong,
      },
      reconciliation: {
        cash_open: tienDauCa,
        expected_cash_close: tienMatKyVong,
        cash_close: tienCuoiCa,
        difference: chenhLech,
      },
    };
  }

  async chotCaLamViec(input: ChotCaInput) {
    const khoang = this.chuanHoaKhoangThoiGian(input.from, input.to);
    const tongHop = await this.tinhTongHopDoiSoat(khoang.from, khoang.to);
    const tienDauCa = this.chuanHoaSoTien(input.cash_open, 0);
    const tienCuoiCa = this.chuanHoaSoTien(input.cash_close, 0);
    const tienMatKyVong = tienDauCa + tongHop.tienMatHeThong;
    const chenhLech = tienCuoiCa - tienMatKyVong;

    const ca = await this.caDoiSoatRepo.save(
      this.caDoiSoatRepo.create({
        thoi_gian_bat_dau: khoang.from,
        thoi_gian_ket_thuc: khoang.to,
        tien_dau_ca: tienDauCa,
        tien_cuoi_ca: tienCuoiCa,
        tien_mat_he_thong: tongHop.tienMatHeThong,
        doanh_thu_he_thong: tongHop.doanhThuHeThong,
        tien_mat_ky_vong: tienMatKyVong,
        chenh_lech: chenhLech,
        tong_don: tongHop.tongDon,
        tong_don_tien_mat: tongHop.tongDonTienMat,
        ghi_chu: input.note?.trim() || null,
        ten_nhan_vien: input.staff_name?.trim() || null,
        du_lieu_tom_tat: {
          non_cash_revenue: tongHop.doanhThuHeThong - tongHop.tienMatHeThong,
        },
      }),
    );

    return {
      message: 'Chot ca thanh cong',
      shift: {
        ma_ca: ca.ma_ca,
        from: ca.thoi_gian_bat_dau,
        to: ca.thoi_gian_ket_thuc,
        cash_open: Number(ca.tien_dau_ca),
        cash_close: Number(ca.tien_cuoi_ca),
        expected_cash_close: Number(ca.tien_mat_ky_vong),
        cash_revenue: Number(ca.tien_mat_he_thong),
        total_revenue: Number(ca.doanh_thu_he_thong),
        difference: Number(ca.chenh_lech),
        total_orders: ca.tong_don,
        cash_orders: ca.tong_don_tien_mat,
        note: ca.ghi_chu,
        staff_name: ca.ten_nhan_vien,
        created_at: ca.ngay_tao,
      },
    };
  }

  async layLichSuChotCa(limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const rows = await this.caDoiSoatRepo.find({
      order: { ngay_tao: 'DESC' },
      take: safeLimit,
    });

    return {
      total: rows.length,
      items: rows.map((row) => ({
        ma_ca: row.ma_ca,
        from: row.thoi_gian_bat_dau,
        to: row.thoi_gian_ket_thuc,
        cash_open: Number(row.tien_dau_ca),
        cash_close: Number(row.tien_cuoi_ca),
        expected_cash_close: Number(row.tien_mat_ky_vong),
        cash_revenue: Number(row.tien_mat_he_thong),
        total_revenue: Number(row.doanh_thu_he_thong),
        difference: Number(row.chenh_lech),
        total_orders: row.tong_don,
        cash_orders: row.tong_don_tien_mat,
        note: row.ghi_chu,
        staff_name: row.ten_nhan_vien,
        created_at: row.ngay_tao,
      })),
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
      const voucherResult = await this.voucherService.kiemTraVoucher(dto.ma_voucher.trim(), tongTienGoc);
      soTienGiam = voucherResult.so_tien_giam;
      maVoucherApDung = voucherResult.voucher.ma_voucher;
    }
    const tongTien = Math.max(0, tongTienGoc - soTienGiam);

    const trangThaiThanhToanBanDau = dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
      ? 'CHO_THANH_TOAN_KHI_NHAN_HANG'
      : 'CHO_XU_LY';

    const maDonHang = crypto.randomUUID();

    // 1. Tạo đơn hàng
    const donHang = await this.donHangRepo.save(this.donHangRepo.create({
      ma_don_hang: maDonHang,
      ma_nguoi_dung: maNguoiDung,
      tong_tien: tongTien,
      ma_voucher: maVoucherApDung,
      so_tien_giam: soTienGiam,
      dia_chi_giao_hang: dto.dia_chi_giao_hang,
      khung_gio_giao: dto.khung_gio_giao ?? null,
      ghi_chu: dto.ghi_chu ?? null,
      phuong_thuc_thanh_toan: dto.phuong_thuc_thanh_toan,
      trang_thai_thanh_toan: trangThaiThanhToanBanDau,
      trang_thai_don_hang: 'MOI_TAO',
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
      await this.voucherService.apDungVoucher(maVoucherApDung);
    }

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Don hang da duoc tao',
      noi_dung: `Don #${donHang.ma_don_hang} da duoc tao thanh cong.${soTienGiam > 0 ? ` Giam gia: ${soTienGiam.toLocaleString('vi-VN')}d` : ''}`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_don_hang: donHang.trang_thai_don_hang },
    });

    await this.cartRepo.delete({ ma_nguoi_dung: maNguoiDung });

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
    const isCash = phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG';
    const maNguoiDung = dto.ma_nguoi_dung?.trim() || `guest-pos-${Date.now()}`;
    const maDonHang = crypto.randomUUID();

    const trangThaiDon = 'MOI_TAO';
    const trangThaiThanhToan = isCash ? 'CHO_THANH_TOAN_KHI_NHAN_HANG' : 'CHO_XU_LY';
    const diaChi = loaiDon === 'TAI_CHO' ? `Tai quay${dto.ma_ban?.trim() ? ` - Ban ${dto.ma_ban.trim()}` : ''}` : 'Mang di tai quay';

    const donHang = await this.donHangRepo.save(
      this.donHangRepo.create({
        ma_don_hang: maDonHang,
        ma_nguoi_dung: maNguoiDung,
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
      this.chiTietRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        gia_ban: item.gia_ban,
        so_luong: item.so_luong,
        kich_co: null,
        hinh_anh_url: null,
      }),
    );
    await this.chiTietRepo.save(chiTiet);

    const maThamChieu = phuongThuc === 'VNPAY'
      ? `${donHang.ma_don_hang}_${Date.now()}`
      : this.taoMaThamChieu(phuongThuc, donHang.ma_don_hang);

    const giaoDich = await this.giaoDichRepo.save(
      this.giaoDichRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        cong_thanh_toan: phuongThuc,
        ma_tham_chieu: maThamChieu,
        so_tien: tongTien,
        trang_thai: isCash ? 'THANH_CONG' : 'CHO_THANH_TOAN',
      }),
    );

    const orderData = {
      ma_don_hang: donHang.ma_don_hang,
      ma_nguoi_dung: donHang.ma_nguoi_dung,
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

    return { total: orders.length, orders };
  }

  async layDanhSachDonHangChoStaff(boLoc: BoLocLichSuDonHang = {}) {
    const query = this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.chi_tiet', 'chi_tiet')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich');

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

    return { total: orders.length, orders };
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

    return {
      message: 'Cap nhat don hang thanh cong',
      order: ketQua,
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

  async capNhatTrangThaiDonHangChoStaff(maDonHang: string, trangThai: string) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const allowed = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH', 'DA_HUY'];
    if (!allowed.includes(trangThai)) {
      throw new BadRequestException('Trang thai don hang khong hop le');
    }

    const updated = await this.capNhatTrangThaiDonHangHeThong(maDonHang, {
      trang_thai_don_hang: trangThai,
      ghi_chu: 'Nhan vien cua hang cap nhat trang thai',
    });

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
        headers: { 'Content-Type': 'application/json' },
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

  private async tinhTongHopDoiSoat(from: Date, to: Date) {
    const danhSach = await this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich')
      .where('don_hang.ngay_tao >= :from', { from: from.toISOString() })
      .andWhere('don_hang.ngay_tao <= :to', { to: to.toISOString() })
      .orderBy('don_hang.ngay_tao', 'ASC')
      .addOrderBy('giao_dich.ngay_tao', 'DESC')
      .getMany();

    let doanhThuHeThong = 0;
    let tienMatHeThong = 0;
    let tongDonTienMat = 0;

    danhSach.forEach((order) => {
      if (order.trang_thai_don_hang === 'DA_HUY') {
        return;
      }

      const tongTien = Number(order.tong_tien || 0);
      doanhThuHeThong += tongTien;

      if (order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
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
      tienMatHeThong += tongTien;
    });

    return {
      tongDon: danhSach.length,
      tongDonTienMat,
      doanhThuHeThong: Math.round(doanhThuHeThong),
      tienMatHeThong: Math.round(tienMatHeThong),
    };
  }

  private async capNhatTrangThaiDonHangHeThong(
    maDonHang: string,
    payload: { trang_thai_don_hang?: string; trang_thai_thanh_toan?: string; ghi_chu?: string },
  ) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!donHang) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const lichSu: LichSuTrangThai[] = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
    const now = new Date().toISOString();

    if (payload.trang_thai_don_hang && payload.trang_thai_don_hang !== donHang.trang_thai_don_hang) {
      donHang.trang_thai_don_hang = payload.trang_thai_don_hang;
      lichSu.push({ loai: 'ORDER', trang_thai: payload.trang_thai_don_hang, thoi_gian: now, ghi_chu: payload.ghi_chu });
    }

    if (payload.trang_thai_thanh_toan && payload.trang_thai_thanh_toan !== donHang.trang_thai_thanh_toan) {
      donHang.trang_thai_thanh_toan = payload.trang_thai_thanh_toan;
      lichSu.push({ loai: 'PAYMENT', trang_thai: payload.trang_thai_thanh_toan, thoi_gian: now, ghi_chu: payload.ghi_chu });
    }

    donHang.lich_su_trang_thai = lichSu;
    return this.donHangRepo.save(donHang);
  }

  taoUrlRedirectFrontEnd(maNguoiDung: string, maDonHang: string, thanhCong: boolean) {
    const webBase = process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
    return `${webBase}/?payment_status=${thanhCong ? 'success' : 'failed'}&ma_don_hang=${maDonHang}`;
  }
}