import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, IsNull, Repository } from 'typeorm';
import { RedisCacheService } from '../../infrastructure/cache/redis-cache.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { CartItem } from '../cart/cart.entity';
import { NotificationService } from '../notification/notification.service';
import { VoucherService } from '../voucher/voucher.service';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { CaLamViecNhanVien } from './entities/ca-lam-viec-nhan-vien.entity';
import { CaDoiSoat } from './entities/ca-doi-soat.entity';
import { KioskShiftSession } from './entities/kiosk-shift-session.entity';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { DonHang } from './entities/don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';
import { DeliveryTrackingService } from '../shipper/features_thaian/delivery-tracking.service';
import { SurveyService } from '../../services/survey.service';

type KhoiTaoThanhToanDto = {
  phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG' | 'VI_DIEN_TU';
  dia_chi_giao_hang: string;
  khung_gio_giao?: string;
  ghi_chu?: string;
  ma_voucher?: string;
  branch_code?: string;
  delivery_mode?: 'GIAO_TAN_NOI' | 'LAY_TAI_QUAN' | 'DUNG_TAI_CHO';
  delivery_method?: 'INTERNAL' | 'LALAMOVE';
  table_number?: string;
  guest_email?: string;
  guest_phone?: string;
  session_id?: string;
  ten_khach_hang?: string;
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
  phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG' | 'VI_DIEN_TU';
  items: Array<{
    ma_san_pham: number;
    ten_san_pham: string;
    so_luong: number;
    gia_ban: number;
    toppings?: string[];
  }>;
};

type CapNhatDonHangDto = {
  dia_chi_giao_hang?: string;
  khung_gio_giao?: string;
  ghi_chu?: string;
  items?: Array<{
    id?: number;
    ma_san_pham?: number;
    ten_san_pham?: string;
    so_luong: number;
    gia_ban?: number;
    kich_co?: string;
    hinh_anh_url?: string;
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
    toppings?: string[];
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
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  page?: number;
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
  attendance_status?: 'ASSIGNED' | 'PRESENT' | 'LATE' | 'ABSENT';
  check_in_at?: string | null;
  check_out_at?: string | null;
  note?: string;
};

type TaoYeuCauDangKyCaInput = {
  staff_username: string;
  staff_name?: string;
  shift_date: string;
  shift_code: 'SANG' | 'CHIEU' | 'TOI';
  note?: string;
  branch_code?: string;
};

type BoLocYeuCauDangKyCa = {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  branchCode?: string;
};

type XuLyYeuCauDangKyCaInput = {
  status: 'APPROVED' | 'REJECTED';
  manager_username?: string;
  review_note?: string;
  adjusted_shift_date?: string;
  adjusted_shift_code?: 'SANG' | 'CHIEU' | 'TOI';
  adjusted_note?: string;
  branch_code?: string;
};

type TaoYeuCauDangKyCaChoQuanLyInput = {
  manager_username: string;
  manager_name?: string;
  shift_date: string;
  shift_code: 'SANG' | 'CHIEU' | 'TOI';
  note?: string;
  branch_code?: string;
};

type ChamCongCaLamViecInput = {
  shift_id: string;
  staff_username: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  branch_code?: string;
};

type DuyetChamCongNhanVienInput = {
  verify_status: 'PRESENT' | 'LATE' | 'ABSENT';
  verify_note?: string;
  manager_username?: string;
  verified_at?: Date;
  branch_code?: string;
};

type PheDuyetDoiSoatInput = {
  status: 'APPROVED' | 'REJECTED';
  manager_name?: string;
  approval_note?: string;
};

@Injectable()
export class ThanhToanService {
  // VNPAY sandbox defaults; env names aligned with docker-compose.
  private readonly VNP_TMN_CODE = (process.env.VNPAY_TMN_CODE || process.env.VNP_TMN_CODE || 'MEBLXEDU').trim();
  private readonly VNP_HASH_SECRET = (process.env.VNPAY_HASH_SECRET || process.env.VNP_HASH_SECRET || 'T718SPDGIGQSKGM98VCSNAF70M9X93MC').trim();
  private readonly VNP_URL = process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly VNP_RETURN_BASE_URL = (process.env.PAYMENT_RETURN_BASE_URL || process.env.VNP_RETURN_BASE_URL || 'http://localhost:3000').trim();
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
    @InjectRepository(KioskShiftSession)
    private readonly kioskShiftSessionRepo: Repository<KioskShiftSession>,
    private readonly notificationService: NotificationService,
    private readonly voucherService: VoucherService,
    private readonly redisCacheService: RedisCacheService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly deliveryTrackingService: DeliveryTrackingService,
    private readonly customerWalletService: CustomerWalletService,
    private readonly surveyService: SurveyService,
  ) {}

  private normalizeBranchCode(branchCode?: string) {
    return String(branchCode || 'MAC_DINH_CHI').trim().toUpperCase();
  }

  private normalizeOrderStatus(status?: string | null) {
    return String(status || '').trim().toUpperCase();
  }

  private guiSuKienDongBoNhanSu(
    branchCode: string,
    action:
      | 'WORK_SHIFT_CREATED'
      | 'WORK_SHIFT_UPDATED'
      | 'WORK_SHIFT_DELETED'
      | 'SHIFT_REQUEST_CREATED'
      | 'SHIFT_REQUEST_UPDATED'
      | 'SHIFT_REQUEST_DELETED',
    extra: Record<string, any> = {},
  ) {
    this.notificationService.guiSuKienNhanSuTheoChiNhanh(branchCode, {
      domain: 'workforce',
      action,
      ...extra,
    });
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
    if (donHang.trang_thai_don_hang === 'DA_HUY' || donHang.trang_thai_thanh_toan === 'DA_HOAN_TIEN') {
      return null;
    }

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

  private async layTapUsernameNhanVienTheoChiNhanh(
    branchCode: string,
    roles: Array<'STAFF' | 'MANAGER' | 'FRANCHISE_STAFF'> = ['STAFF', 'FRANCHISE_STAFF'],
  ) {

    try {
      const responses = await Promise.all(
        roles.map(async (role) => {
          const endpoint = `${this.IDENTITY_SERVICE_URL}/users/workforce?role=${role}&branch_code=${encodeURIComponent(branchCode)}`;
          const response = await fetch(endpoint, {
            headers: {
              'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
            },
          });
          const payload: any = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.message || `Khong tai duoc danh sach ${role} theo chi nhanh`);
          }
          return Array.isArray(payload?.items) ? payload.items : [];
        }),
      );

      const usernames = responses
        .flat()
        .map((item: any) => String(item?.ten_dang_nhap || item?.tenDangNhap || item?.username || '').trim().toLowerCase())
        .filter(Boolean);

      return new Set(usernames);
    } catch (error) {
      throw new BadRequestException('Khong the dong bo danh sach nhan vien theo chi nhanh');
    }
  }

  private async layDanhSachNhanSuNhanThongBaoTheoChiNhanh(branchCode: string) {
    const roles: Array<'STAFF' | 'MANAGER'> = ['STAFF', 'MANAGER'];

    try {
      const responses = await Promise.all(
        roles.map(async (role) => {
          const endpoint = `${this.IDENTITY_SERVICE_URL}/users/workforce?role=${role}&branch_code=${encodeURIComponent(branchCode)}`;
          const response = await fetch(endpoint, {
            headers: {
              'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
            },
          });
          const payload: any = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.message || `Khong tai duoc danh sach ${role}`);
          }
          return Array.isArray(payload?.items) ? payload.items : [];
        }),
      );

      const merged = responses.flat();
      const uniqueMap = new Map<string, any>();
      for (const item of merged) {
        const userId = String(item?.ma_nguoi_dung || '').trim();
        if (!userId || uniqueMap.has(userId)) continue;
        uniqueMap.set(userId, item);
      }

      return Array.from(uniqueMap.values());
    } catch {
      return [];
    }
  }

  private mapTrangThaiDonHangLabel(status: string) {
    const map: Record<string, string> = {
      MOI_TAO: 'Moi tao',
      DA_XAC_NHAN: 'Da xac nhan',
      DANG_CHUAN_BI: 'Dang chuan bi',
      DANG_GIAO: 'Dang giao',
      HOAN_THANH: 'Hoan thanh',
      DA_HUY: 'Da huy',
    };
    return map[status] || status;
  }

  private mapTrangThaiThanhToanLabel(status: string) {
    const map: Record<string, string> = {
      CHO_XU_LY: 'Cho xu ly',
      CHO_THANH_TOAN: 'Cho thanh toan',
      CHO_THANH_TOAN_KHI_NHAN_HANG: 'Cho thu tien COD',
      CHO_THU_TIEN: 'Cho thu tien',
      DA_THANH_TOAN: 'Da thanh toan',
      THAT_BAI: 'That bai',
    };
    return map[status] || status;
  }

  private async guiThongBaoDonHangChoNhanSuChiNhanh(payload: {
    branchCode?: string | null;
    title: string;
    content: string;
    data?: Record<string, any>;
    type?: 'ORDER' | 'PAYMENT' | 'SYSTEM';
  }) {
    const branchCode = this.normalizeBranchCode(payload.branchCode || undefined);
    if (!branchCode) return;

    const recipients = await this.layDanhSachNhanSuNhanThongBaoTheoChiNhanh(branchCode);
    if (!recipients.length) return;

    await Promise.allSettled(
      recipients.map((item) => {
        const userId = String(item?.ma_nguoi_dung || '').trim();
        if (!userId) return Promise.resolve(null);
        return this.notificationService.taoThongBao({
          ma_nguoi_dung: userId,
          tieu_de: payload.title,
          noi_dung: payload.content,
          loai: payload.type || 'ORDER',
          du_lieu: payload.data || null,
        });
      }),
    );
  }

  private async xacDinhCoSoGanNhatTheoDiaChi(diaChi: string) {
    const DEFAULT_BRANCH = { code: 'HCM_DIEN_BIEN_PHU', lat: 10.7836, lon: 106.6896 };
    if (!diaChi || diaChi.trim() === '') return { branchCode: DEFAULT_BRANCH.code, branchLat: DEFAULT_BRANCH.lat, branchLon: DEFAULT_BRANCH.lon, customerLat: null, customerLon: null };

    const BRANCH_LOCATIONS = [
      { code: 'DN_INDOCHINA_RIVERSIDE', lat: 16.0717, lon: 108.2241 },
      { code: 'DN_NGUYEN_VAN_THOAI', lat: 16.0543, lon: 108.2435 },
      { code: 'DN_VTV8_BACH_DANG', lat: 16.0645, lon: 108.2230 },
      { code: 'HCM_DIEN_BIEN_PHU', lat: 10.7836, lon: 106.6896 },
      { code: 'HCM_LY_TU_TRONG', lat: 10.7745, lon: 106.6983 },
      { code: 'HCM_TON_THAT_THIEP', lat: 10.7743, lon: 106.7031 },
      { code: 'HN_DU_THUYEN', lat: 21.0456, lon: 105.8369 },
      { code: 'HN_LAM_VIEN_COMPLEX', lat: 21.0401, lon: 105.7904 },
      { code: 'HN_LINH_DAM_CT3', lat: 20.9634, lon: 105.8306 },
    ];

    const normalizedDiaChi = diaChi.toLowerCase();

    // 0. Heuristic override cho các địa danh/đường nổi tiếng ở Q1 (Vì Nominatim hay tìm sai số nhà VN)
    if (normalizedDiaChi.includes('nguyễn huệ') || normalizedDiaChi.includes('bitexco') || normalizedDiaChi.includes('tôn thất thiệp') || normalizedDiaChi.includes('mac thi buoi') || normalizedDiaChi.includes('ngo duc ke')) {
      return { branchCode: 'HCM_TON_THAT_THIEP', branchLat: 10.7743, branchLon: 106.7031, customerLat: 10.7738, customerLon: 106.7030 };
    }
    if (normalizedDiaChi.includes('độc lập') || normalizedDiaChi.includes('doc lap') || normalizedDiaChi.includes('lý tự trọng') || normalizedDiaChi.includes('le thanh ton') || normalizedDiaChi.includes('dong khoi')) {
      return { branchCode: 'HCM_LY_TU_TRONG', branchLat: 10.7745, branchLon: 106.6983, customerLat: 10.7770, customerLon: 106.6950 };
    }

    // Heuristic override cho BHH B, Bình Tân để test Map Shipper
    if (normalizedDiaChi.includes('nguyễn thị tú')) {
      return { branchCode: 'HCM_DIEN_BIEN_PHU', branchLat: 10.7836, branchLon: 106.6896, customerLat: 10.8143, customerLon: 106.5985 }; // Nguyễn Thị Tú, BHH B
    }
    if (normalizedDiaChi.includes('liên khu 4-5') || normalizedDiaChi.includes('liên khu 45')) {
      return { branchCode: 'HCM_DIEN_BIEN_PHU', branchLat: 10.7836, branchLon: 106.6896, customerLat: 10.7937, customerLon: 106.5975 }; // Liên Khu 4-5, BHH B (Cách N.T.Tú ~2.5km)
    }
    if (normalizedDiaChi.includes('điện biên phủ') || normalizedDiaChi.includes('dien bien phu')) {
      return { branchCode: 'HCM_DIEN_BIEN_PHU', branchLat: 10.7836, branchLon: 106.6896, customerLat: 10.7890, customerLon: 106.6980 }; // Giả lập Đa Kao Q1
    }

    try {
      // 1. Tối ưu chuỗi tìm kiếm (Bỏ bớt Phường/Quận để Nominatim dễ tìm chính xác số nhà/đường hơn)
      const cleanedDiaChi = diaChi
        .replace(/(Phường|Xã|Thị trấn)\s+[^,]+,/gi, '')
        .replace(/(Quận|Huyện)\s+[^,]+,/gi, '')
        .trim();
      const searchDiaChi = cleanedDiaChi.length > 5 ? cleanedDiaChi : diaChi;

      // Gọi Nominatim API để lấy toạ độ khách hàng
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchDiaChi)}&countrycodes=vn&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'AvengersCoffeeApp/1.0',
        },
      });
      const data = await response.json();

      if (data && data.length > 0) {
        const customerLat = parseFloat(data[0].lat);
        const customerLon = parseFloat(data[0].lon);

        // 2. Hàm tính khoảng cách Haversine
        const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371; // Bán kính trái đất (km)
          const dLat = (lat2 - lat1) * (Math.PI / 180);
          const dLon = (lon2 - lon1) * (Math.PI / 180);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        // 3. Tìm chi nhánh gần nhất
        let nearestBranch = DEFAULT_BRANCH;
        let minDistance = Infinity;

        for (const branch of BRANCH_LOCATIONS) {
          const dist = getDistanceFromLatLonInKm(customerLat, customerLon, branch.lat, branch.lon);
          if (dist < minDistance) {
            minDistance = dist;
            nearestBranch = branch;
          }
        }
        return { branchCode: nearestBranch.code, branchLat: nearestBranch.lat, branchLon: nearestBranch.lon, customerLat, customerLon };
      }
    } catch (error) {
      console.error('Lỗi khi gọi API Geocoding, fallback về logic từ khoá:', error);
    }
    const normalized = String(diaChi || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const hcmHints = [
      'dien bien phu',
      'ly tu trong',
      'ton that thiep',
      'quan 1',
      'quan 3',
      'ho chi minh',
      'hcm',
      'ben thanh'
    ];

    const hnHints = [
      'linh dam',
      'hoang mai',
      'cau giay',
      'dich vong',
      'thanh nien',
      'ba dinh',
      'ha noi',
      'hn'
    ];

    const dnHints = [
      'indochina',
      'bach dang',
      'hai chau',
      'nguyen van thoai',
      'phuoc my',
      'son tra',
      'da nang',
      'dn'
    ];

    if (hcmHints.some((keyword) => normalized.includes(keyword))) {
      return { branchCode: 'HCM_DIEN_BIEN_PHU', branchLat: 10.7836, branchLon: 106.6896, customerLat: null, customerLon: null };
    }

    if (hnHints.some((keyword) => normalized.includes(keyword))) {
      return { branchCode: 'HN_LAM_VIEN_COMPLEX', branchLat: 21.0401, branchLon: 105.7904, customerLat: null, customerLon: null };
    }

    if (dnHints.some((keyword) => normalized.includes(keyword))) {
      return { branchCode: 'DN_INDOCHINA_RIVERSIDE', branchLat: 16.0717, branchLon: 108.2241, customerLat: null, customerLon: null };
    }

    // Default fallback
    return { branchCode: DEFAULT_BRANCH.code, branchLat: DEFAULT_BRANCH.lat, branchLon: DEFAULT_BRANCH.lon, customerLat: null, customerLon: null };
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

    await this.guiThongBaoDonHangChoNhanSuChiNhanh({
      branchCode: order.co_so_ma,
      title: 'Co don hang moi',
      content: `Don #${String(order.ma_don_hang || '').slice(0, 8).toUpperCase()} vua duoc tao.`,
      type: 'ORDER',
      data: {
        ma_don_hang: order.ma_don_hang,
        co_so_ma: order.co_so_ma,
        trang_thai_don_hang: order.trang_thai_don_hang,
        trang_thai_thanh_toan: order.trang_thai_thanh_toan,
      },
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
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode, ['STAFF', 'MANAGER', 'FRANCHISE_STAFF']);
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
          nguon_tao: 'MANAGER_ASSIGNMENT',
          trang_thai_yeu_cau: 'APPROVED',
          thoi_gian_gui_yeu_cau: new Date(),
          nguoi_duyet_yeu_cau: input.manager_username?.trim() || null,
          ghi_chu_duyet: null,
          thoi_gian_duyet: new Date(),
        }),
      );
    }

    const saved = await this.caLamViecNhanVienRepo.save(entities);
    this.guiSuKienDongBoNhanSu(branchCode, 'WORK_SHIFT_CREATED', {
      shiftIds: saved.map((row) => row.ma_ca_lam_viec),
      staffUsername,
      shiftDate,
    });
    return {
      message: `Tao lich lam viec thanh cong (${saved.length} ca)`,
      item: this.dinhDangCaLamViec(saved[0]),
      items: saved.map((row) => this.dinhDangCaLamViec(row)),
      created_count: saved.length,
    };
  }

  async layDanhSachLichLamViecChoManager(boLoc: BoLocLichLamViec = {}) {
    const branchCode = this.normalizeBranchCode(boLoc.branchCode);
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode, ['STAFF', 'MANAGER', 'FRANCHISE_STAFF']);
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

    const filteredRows =
      validStaffByBranch && validStaffByBranch.size > 0
        ? rows.filter((row) => validStaffByBranch.has(String(row.staff_username || '').trim().toLowerCase()))
        : rows;

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

    const allowedStatus = ['ASSIGNED', 'PRESENT', 'LATE', 'ABSENT'];
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
    this.guiSuKienDongBoNhanSu(branchCode, 'WORK_SHIFT_UPDATED', {
      shiftId: updated.ma_ca_lam_viec,
      staffUsername: updated.staff_username,
      shiftDate: updated.ngay_lam_viec,
    });
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
    this.guiSuKienDongBoNhanSu(branchCode, 'WORK_SHIFT_DELETED', {
      shiftId: maCaLamViec,
      staffUsername: ca.staff_username,
      shiftDate: ca.ngay_lam_viec,
    });
    return {
      message: 'Xoa lich lam viec thanh cong',
      ma_ca_lam_viec: maCaLamViec,
    };
  }

  async layLichLamViecChoStaff(staffUsername: string, from?: string, to?: string, branchCodeRaw?: string) {
    const normalizedUsername = String(staffUsername || '').trim();
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode, ['STAFF', 'MANAGER', 'FRANCHISE_STAFF']);
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

  private async kiemTraTrungCaLamViec(
    branchCode: string,
    staffUsername: string,
    shiftDate: string,
    shiftCode: 'SANG' | 'CHIEU' | 'TOI',
    ignoreId?: string,
  ) {
    const query = this.caLamViecNhanVienRepo
      .createQueryBuilder('ca')
      .where('ca.co_so_ma = :branchCode', { branchCode })
      .andWhere('ca.staff_username = :staffUsername', { staffUsername })
      .andWhere('ca.ngay_lam_viec = :shiftDate', { shiftDate })
      .andWhere('ca.ma_khung_ca = :shiftCode', { shiftCode })
      .andWhere('ca.trang_thai_yeu_cau <> :rejectedStatus', { rejectedStatus: 'REJECTED' });

    if (ignoreId) {
      query.andWhere('ca.ma_ca_lam_viec <> :ignoreId', { ignoreId });
    }

    const existed = await query.getOne();
    if (existed) {
      throw new BadRequestException(`Nhan vien da co lich/yeu cau cho khung ca ${shiftCode} ngay ${shiftDate}`);
    }
  }

  private kiemTraRangBuocDangKyCa(shiftDateStr: string) {
    const now = new Date();
    // Giờ Việt Nam (UTC+7)
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const vnDayOfWeek = vnNow.getUTCDay(); // 0: Chủ Nhật, 1: Thứ 2, ..., 6: Thứ 7

    // 1. Ràng buộc: Chỉ được đăng ký ca trước Chủ Nhật hàng tuần (từ Thứ 2 đến hết Thứ 7)
    if (vnDayOfWeek === 0) {
      throw new BadRequestException(
        'Thời hạn đăng ký ca làm việc cho tuần tới đã kết thúc. Nhân viên chỉ được đăng ký ca trước Chủ Nhật hàng tuần (hạn chót: 23:59 Thứ Bảy) để Quản lý chi nhánh duyệt lịch làm việc chính thức.',
      );
    }

    // 2. Ràng buộc: Chỉ được đăng ký cho tuần kế tiếp (Thứ 2 đến Chủ Nhật của tuần sau)
    const currentMondayUtc = Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate() - (vnDayOfWeek - 1),
    );

    const nextMondayDate = new Date(currentMondayUtc + 7 * 24 * 60 * 60 * 1000);
    const nextSundayDate = new Date(currentMondayUtc + 13 * 24 * 60 * 60 * 1000);

    const fmtDate = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const nextMondayStr = fmtDate(nextMondayDate);
    const nextSundayStr = fmtDate(nextSundayDate);

    if (shiftDateStr < nextMondayStr || shiftDateStr > nextSundayStr) {
      throw new BadRequestException(
        `Chỉ được đăng ký ca làm việc cho tuần kế tiếp (từ ngày ${nextMondayStr} đến ngày ${nextSundayStr}). Vui lòng chọn ngày làm việc trong tuần tiếp theo.`,
      );
    }
  }

  async taoYeuCauDangKyCaChoStaff(input: TaoYeuCauDangKyCaInput) {
    const staffUsername = String(input.staff_username || '').trim();
    const shiftDate = String(input.shift_date || '').trim();
    const shiftCode = String(input.shift_code || '').trim().toUpperCase() as 'SANG' | 'CHIEU' | 'TOI';

    if (!staffUsername) {
      throw new BadRequestException('staff_username la bat buoc');
    }
    if (!shiftDate) {
      throw new BadRequestException('shift_date la bat buoc');
    }

    // Kiểm tra ràng buộc đăng ký ca (chỉ trước Chủ Nhật & chỉ tuần kế tiếp)
    this.kiemTraRangBuocDangKyCa(shiftDate);

    const shiftSlot = this.layKhungCaLamViec(shiftCode);
    if (!shiftSlot) {
      throw new BadRequestException('shift_code khong hop le');
    }

    let branchCode = this.normalizeBranchCode(input.branch_code);
    let validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode, ['STAFF', 'FRANCHISE_STAFF']);
    if (!validStaffByBranch.has(staffUsername.toLowerCase())) {
      try {
        const res = await fetch(`${this.IDENTITY_SERVICE_URL}/users/workforce`, {
          headers: { 'x-internal-token': this.INTERNAL_SERVICE_TOKEN },
        });
        const payload: any = await res.json().catch(() => ({}));
        const found = (Array.isArray(payload?.items) ? payload.items : []).find(
          (u: any) => String(u?.ten_dang_nhap || '').toLowerCase() === staffUsername.toLowerCase(),
        );
        if (found && found.co_so_ma) {
          branchCode = this.normalizeBranchCode(found.co_so_ma);
          validStaffByBranch = await this.layTapUsernameNhanVienTheoChiNhanh(branchCode, ['STAFF', 'FRANCHISE_STAFF']);
        }
      } catch (e) {}
    }

    if (!validStaffByBranch.has(staffUsername.toLowerCase())) {
      throw new BadRequestException(`Nhân viên ${staffUsername} không thuộc chi nhánh ${branchCode}`);
    }

    await this.kiemTraTrungCaLamViec(branchCode, staffUsername, shiftDate, shiftCode);

    const created = await this.caLamViecNhanVienRepo.save(
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
        manager_username: null,
        trang_thai_cham_cong: 'ASSIGNED',
        check_in_at: null,
        check_out_at: null,
        nguon_tao: 'STAFF_REQUEST',
        trang_thai_yeu_cau: 'PENDING',
        thoi_gian_gui_yeu_cau: new Date(),
        nguoi_duyet_yeu_cau: null,
        ghi_chu_duyet: null,
        thoi_gian_duyet: null,
      }),
    );

    this.guiSuKienDongBoNhanSu(branchCode, 'SHIFT_REQUEST_CREATED', {
      requestId: created.ma_ca_lam_viec,
      staffUsername: created.staff_username,
      shiftDate: created.ngay_lam_viec,
      shiftCode: created.ma_khung_ca,
    });

    return {
      message: 'Da gui yeu cau dang ky ca cho manager',
      item: this.dinhDangCaLamViec(created),
    };
  }

  async layYeuCauDangKyCaChoManager(boLoc: BoLocYeuCauDangKyCa = {}) {
    const branchCode = this.normalizeBranchCode(boLoc.branchCode);
    const query = this.caLamViecNhanVienRepo
      .createQueryBuilder('ca')
      .where('ca.co_so_ma = :branchCode', { branchCode })
      .andWhere('ca.nguon_tao = :source', { source: 'STAFF_REQUEST' });

    if (boLoc.status) {
      query.andWhere('ca.trang_thai_yeu_cau = :status', { status: boLoc.status });
    }

    const rows = await query
      .orderBy('ca.trang_thai_yeu_cau', 'ASC')
      .addOrderBy('ca.ngay_lam_viec', 'ASC')
      .addOrderBy('ca.gio_bat_dau', 'ASC')
      .addOrderBy('ca.ngay_tao', 'DESC')
      .getMany();

    return {
      total: rows.length,
      items: rows.map((row) => this.dinhDangCaLamViec(row)),
    };
  }

  async xuLyYeuCauDangKyCaChoManager(maCaLamViec: string, input: XuLyYeuCauDangKyCaInput) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const request = await this.caLamViecNhanVienRepo.findOne({
      where: { ma_ca_lam_viec: maCaLamViec, co_so_ma: branchCode },
    });

    if (!request) {
      throw new NotFoundException('Khong tim thay yeu cau dang ky ca');
    }
    if (request.nguon_tao !== 'STAFF_REQUEST') {
      throw new BadRequestException('Chi duoc xu ly yeu cau do staff gui');
    }
    if (!['APPROVED', 'REJECTED'].includes(input.status)) {
      throw new BadRequestException('Trang thai xu ly khong hop le');
    }

    let finalShiftDate = request.ngay_lam_viec;
    let finalShiftCode = request.ma_khung_ca as 'SANG' | 'CHIEU' | 'TOI';

    if (input.status === 'APPROVED') {
      if (input.adjusted_shift_date?.trim()) {
        finalShiftDate = input.adjusted_shift_date.trim();
      }
      if (input.adjusted_shift_code?.trim()) {
        finalShiftCode = String(input.adjusted_shift_code).trim().toUpperCase() as 'SANG' | 'CHIEU' | 'TOI';
      }

      const shiftSlot = this.layKhungCaLamViec(finalShiftCode);
      if (!shiftSlot) {
        throw new BadRequestException('Khung ca dieu chinh khong hop le');
      }

      await this.kiemTraTrungCaLamViec(branchCode, request.staff_username, finalShiftDate, finalShiftCode, request.ma_ca_lam_viec);

      request.ngay_lam_viec = finalShiftDate;
      request.ma_khung_ca = finalShiftCode;
      request.ten_ca = shiftSlot.ten_ca;
      request.gio_bat_dau = shiftSlot.gio_bat_dau;
      request.gio_ket_thuc = shiftSlot.gio_ket_thuc;

      if (input.adjusted_note !== undefined) {
        request.note = input.adjusted_note?.trim() || null;
      }
    }

    request.trang_thai_yeu_cau = input.status;
    request.nguoi_duyet_yeu_cau = input.manager_username?.trim() || null;
    request.ghi_chu_duyet = input.review_note?.trim() || null;
    request.thoi_gian_duyet = new Date();

    const updated = await this.caLamViecNhanVienRepo.save(request);
    this.guiSuKienDongBoNhanSu(branchCode, 'SHIFT_REQUEST_UPDATED', {
      requestId: updated.ma_ca_lam_viec,
      staffUsername: updated.staff_username,
      shiftDate: updated.ngay_lam_viec,
      shiftCode: updated.ma_khung_ca,
      requestStatus: updated.trang_thai_yeu_cau,
    });
    return {
      message: input.status === 'APPROVED' ? 'Da phe duyet yeu cau dang ky ca' : 'Da tu choi yeu cau dang ky ca',
      item: this.dinhDangCaLamViec(updated),
    };
  }

  async xoaYeuCauDangKyCa(maCaLamViec: string, branchCode?: string) {
    const normalizedBranchCode = this.normalizeBranchCode(branchCode);
    const request = await this.caLamViecNhanVienRepo.findOne({
      where: { ma_ca_lam_viec: maCaLamViec, co_so_ma: normalizedBranchCode },
    });

    if (!request) {
      throw new NotFoundException('Khong tim thay yeu cau dang ky ca');
    }

    // Only allow deletion of PENDING or REJECTED requests
    if (!['PENDING', 'REJECTED'].includes(request.trang_thai_yeu_cau || '')) {
      throw new BadRequestException('Chi duoc xoa yeu cau cap dang ky hoac da bi tu choi');
    }

    // Only allow deletion of STAFF_REQUEST (not manager assignments)
    if (request.nguon_tao !== 'STAFF_REQUEST') {
      throw new BadRequestException('Chi duoc xoa yeu cau cap do staff gui');
    }

    await this.caLamViecNhanVienRepo.delete({ ma_ca_lam_viec: maCaLamViec });
    this.guiSuKienDongBoNhanSu(normalizedBranchCode, 'SHIFT_REQUEST_DELETED', {
      requestId: maCaLamViec,
      staffUsername: request.staff_username,
      shiftDate: request.ngay_lam_viec,
      shiftCode: request.ma_khung_ca,
      requestStatus: request.trang_thai_yeu_cau,
    });

    return {
      message: 'Da xoa yeu cau dang ky ca',
      ma_ca_lam_viec: maCaLamViec,
    };
  }

  async taoYeuCauDangKyCaChoQuanLy(input: TaoYeuCauDangKyCaChoQuanLyInput) {
    const managerUsername = String(input.manager_username || '').trim();
    const shiftDate = String(input.shift_date || '').trim();
    const shiftCode = String(input.shift_code || '').trim().toUpperCase() as 'SANG' | 'CHIEU' | 'TOI';

    if (!managerUsername) {
      throw new BadRequestException('manager_username la bat buoc');
    }
    if (!shiftDate) {
      throw new BadRequestException('shift_date la bat buoc');
    }

    const shiftSlot = this.layKhungCaLamViec(shiftCode);
    if (!shiftSlot) {
      throw new BadRequestException('shift_code khong hop le');
    }

    const branchCode = this.normalizeBranchCode(input.branch_code);
    await this.kiemTraTrungCaLamViec(branchCode, managerUsername, shiftDate, shiftCode);

    const now = new Date();
    const created = await this.caLamViecNhanVienRepo.save(
      this.caLamViecNhanVienRepo.create({
        co_so_ma: branchCode,
        staff_username: managerUsername,
        staff_name: input.manager_name?.trim() || managerUsername,
        ngay_lam_viec: shiftDate,
        ma_khung_ca: shiftCode,
        ten_ca: shiftSlot.ten_ca,
        gio_bat_dau: shiftSlot.gio_bat_dau,
        gio_ket_thuc: shiftSlot.gio_ket_thuc,
        note: input.note?.trim() || null,
        manager_username: managerUsername,
        trang_thai_cham_cong: 'ASSIGNED',
        check_in_at: null,
        check_out_at: null,
        nguon_tao: 'MANAGER_REQUEST',
        trang_thai_yeu_cau: 'APPROVED',
        thoi_gian_gui_yeu_cau: now,
        nguoi_duyet_yeu_cau: managerUsername,
        ghi_chu_duyet: 'Manager tu dang ky ca lam viec',
        thoi_gian_duyet: now,
      }),
    );

    this.guiSuKienDongBoNhanSu(branchCode, 'SHIFT_REQUEST_CREATED', {
      requestId: created.ma_ca_lam_viec,
      staffUsername: created.staff_username,
      shiftDate: created.ngay_lam_viec,
      shiftCode: created.ma_khung_ca,
      requestStatus: created.trang_thai_yeu_cau,
      source: created.nguon_tao,
    });

    return {
      message: 'Da dang ky ca lam viec cho quan ly',
      item: this.dinhDangCaLamViec(created),
    };
  }

  async thoiGianVaoCaLamViec(input: ChamCongCaLamViecInput) {
    const shiftId = String(input.shift_id || '').trim();
    const staffUsername = String(input.staff_username || '').trim();
    const action = String(input.action || '').trim().toUpperCase() as 'CHECK_IN' | 'CHECK_OUT';

    if (!shiftId) {
      throw new BadRequestException('shift_id la bat buoc');
    }
    if (!staffUsername) {
      throw new BadRequestException('staff_username la bat buoc');
    }
    if (!['CHECK_IN', 'CHECK_OUT'].includes(action)) {
      throw new BadRequestException('action khong hop le');
    }

    const branchCode = this.normalizeBranchCode(input.branch_code);
    const shift = await this.caLamViecNhanVienRepo.findOne({
      where: {
        ma_ca_lam_viec: shiftId,
        co_so_ma: branchCode,
        staff_username: staffUsername,
      },
    });

    if (!shift) {
      throw new NotFoundException('Khong tim thay ca lam viec');
    }
    if (shift.trang_thai_yeu_cau !== 'APPROVED') {
      throw new BadRequestException('Chi duoc cham cong cho ca da duoc phe duyet');
    }

    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (shift.ngay_lam_viec > todayLocal) {
      throw new BadRequestException('Ca lam viec chua den ngay, khong the check-in/check-out');
    }

    if (action === 'CHECK_IN') {
      if (shift.check_in_at) {
        throw new BadRequestException('Ca nay da check-in');
      }

      const shiftStart = new Date(`${shift.ngay_lam_viec}T${shift.gio_bat_dau}:00`);
      if (Number.isNaN(shiftStart.getTime())) {
        throw new BadRequestException('Khong xac dinh duoc gio bat dau ca lam viec');
      }
      const allowedEarlyCheckIn = new Date(shiftStart.getTime() - 30 * 60 * 1000);
      if (now.getTime() < allowedEarlyCheckIn.getTime()) {
        throw new BadRequestException('Chi duoc check-in truoc toi da 30 phut');
      }

      shift.check_in_at = now;
      shift.trang_thai_cham_cong = 'PRESENT';
    }

    if (action === 'CHECK_OUT') {
      if (!shift.check_in_at) {
        throw new BadRequestException('Can check-in truoc khi check-out');
      }
      if (shift.check_out_at) {
        throw new BadRequestException('Ca nay da check-out');
      }

      shift.check_out_at = now;
      if (shift.trang_thai_cham_cong === 'ASSIGNED') {
        shift.trang_thai_cham_cong = 'PRESENT';
      }
    }

    const updated = await this.caLamViecNhanVienRepo.save(shift);
    this.guiSuKienDongBoNhanSu(branchCode, 'WORK_SHIFT_UPDATED', {
      shiftId: updated.ma_ca_lam_viec,
      staffUsername: updated.staff_username,
      shiftDate: updated.ngay_lam_viec,
      attendanceAction: action,
    });

    return {
      message: action === 'CHECK_IN' ? 'Check-in thanh cong' : 'Check-out thanh cong',
      item: this.dinhDangCaLamViec(updated),
    };
  }

  async duyetXacNhanChamCongNhanVien(maCaLamViec: string, input: DuyetChamCongNhanVienInput) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const shift = await this.caLamViecNhanVienRepo.findOne({
      where: { ma_ca_lam_viec: maCaLamViec, co_so_ma: branchCode },
    });

    if (!shift) {
      throw new NotFoundException('Khong tim thay ca lam viec');
    }

    const allowedStatuses = ['PRESENT', 'LATE', 'ABSENT'];
    if (!allowedStatuses.includes(input.verify_status)) {
      throw new BadRequestException('verify_status khong hop le');
    }

    shift.trang_thai_cham_cong = input.verify_status;
    shift.nguoi_duyet_yeu_cau = input.manager_username?.trim() || shift.nguoi_duyet_yeu_cau;
    shift.ghi_chu_duyet = input.verify_note?.trim() || shift.ghi_chu_duyet;
    shift.thoi_gian_duyet = input.verified_at || new Date();

    if (input.verify_status === 'ABSENT') {
      shift.check_in_at = null;
      shift.check_out_at = null;
    }

    const updated = await this.caLamViecNhanVienRepo.save(shift);
    this.guiSuKienDongBoNhanSu(branchCode, 'WORK_SHIFT_UPDATED', {
      shiftId: updated.ma_ca_lam_viec,
      staffUsername: updated.staff_username,
      shiftDate: updated.ngay_lam_viec,
      attendanceStatus: updated.trang_thai_cham_cong,
    });

    return {
      message: 'Da duyet cham cong nhan vien',
      item: this.dinhDangCaLamViec(updated),
    };
  }

  async khoiTaoThanhToan(maNguoiDung: string, dto: KhoiTaoThanhToanDto, ipAddr = '127.0.0.1') {
    if (!dto.dia_chi_giao_hang?.trim()) {
      throw new BadRequestException('dia_chi_giao_hang la bat buoc');
    }

    const isGuest = !maNguoiDung || maNguoiDung === 'anonymous' || maNguoiDung === 'guest' || maNguoiDung.startsWith('anon-');
    if (isGuest) {
      if (!dto.guest_email?.trim() && !dto.guest_phone?.trim()) {
        throw new BadRequestException('Khách vãng lai cần nhập ít nhất Email hoặc Số điện thoại để định danh.');
      }
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
      const hasToppings = gioHang.some(item => Array.isArray(item.toppings) && item.toppings.length > 0);
      const voucherResult = await this.voucherService.kiemTraVoucher(dto.ma_voucher.trim(), tongTienGoc, maNguoiDung, hasToppings);
      soTienGiam = voucherResult.so_tien_giam;
      maVoucherApDung = voucherResult.voucher.ma_voucher;
    }
    const tongTien = Math.max(0, tongTienGoc - soTienGiam);
    const nearestInfo = await this.xacDinhCoSoGanNhatTheoDiaChi(dto.dia_chi_giao_hang);
    const branchCode = dto.delivery_mode === 'GIAO_TAN_NOI'
      ? nearestInfo.branchCode
      : (dto.branch_code?.trim() ? this.normalizeBranchCode(dto.branch_code) : nearestInfo.branchCode);

    const trangThaiThanhToanBanDau = dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
      ? 'CHO_THANH_TOAN_KHI_NHAN_HANG'
      : 'CHO_XU_LY';

    const maDonHang = crypto.randomUUID();

    // 1. Tạo đơn hàng
    const donHang = await this.donHangRepo.save(this.donHangRepo.create({
      ma_don_hang: maDonHang,
      ma_nguoi_dung: isGuest ? null : maNguoiDung,
      guest_email: isGuest ? (dto.guest_email?.trim() || null) : null,
      guest_phone: isGuest ? (dto.guest_phone?.trim() || null) : null,
      session_id: dto.session_id?.trim() || null,
      co_so_ma: branchCode,
      tong_tien: tongTien,
      ma_voucher: maVoucherApDung,
      so_tien_giam: soTienGiam,
      dia_chi_giao_hang: dto.dia_chi_giao_hang,
      khung_gio_giao: dto.khung_gio_giao ?? null,
      ghi_chu: dto.ghi_chu ?? null,
      loai_don_hang: dto.delivery_mode ?? null,
      ma_ban: dto.table_number ?? null,
      ten_khach_hang: dto.ten_khach_hang ?? (isGuest ? (dto.guest_email?.trim() || dto.guest_phone?.trim() || null) : null),
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
          ghi_chu: 'Phuong thuc thanh toan: ' + dto.phuong_thuc_thanh_toan,
        },
      ],
    }));
    require('fs').appendFileSync('/app/error.log', '\n[DEBUG] Saved don_hang in DB: ma_ban=' + donHang.ma_ban + ', don_hang_id=' + donHang.ma_don_hang + '\n');

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
        toppings: item.toppings || [],
        luong_da: item.luong_da || null,
        do_ngot: item.do_ngot || null,
        ghi_chu: item.custom_attributes?.ghi_chu || null,
      }),
    );
    await this.chiTietRepo.save(chiTiet);

    // 3. Tạo Tracking Giao Hàng nếu có chọn
    if (dto.delivery_mode) {
      // Dùng toạ độ từ nearestInfo nếu không có thì null
      await this.deliveryTrackingService.createTracking({
        ma_don_hang: donHang.ma_don_hang,
        delivery_mode: dto.delivery_mode,
        delivery_method: dto.delivery_method,
        branch_code: branchCode,
        table_number: dto.table_number,
        delivery_address: dto.dia_chi_giao_hang,
        customer_phone: maNguoiDung,
        store_latitude: nearestInfo?.branchLat,
        store_longitude: nearestInfo?.branchLon,
        destination_latitude: nearestInfo?.customerLat ?? undefined,
        destination_longitude: nearestInfo?.customerLon ?? undefined,
      });
    }

    // 4. Tạo mã tham chiếu giao dịch
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
    if (dto.phuong_thuc_thanh_toan === 'VI_DIEN_TU') {
      await this.customerWalletService.deductBalance(maNguoiDung, tongTien, maThamChieu);
      
      donHang.trang_thai_thanh_toan = 'DA_THANH_TOAN';
      donHang.trang_thai_don_hang = 'DA_XAC_NHAN';
      await this.donHangRepo.save(donHang);
      
      giaoDich.trang_thai = 'DA_THANH_TOAN';
      await this.giaoDichRepo.save(giaoDich);

      await Promise.all([
        this.notificationService.taoThongBao({
          ma_nguoi_dung: maNguoiDung,
          tieu_de: 'Thanh toan vi dien tu thanh cong',
          noi_dung: `Don #${donHang.ma_don_hang} da duoc thanh toan bang vi dien tu.`,
          loai: 'PAYMENT',
          du_lieu: { ma_don_hang: donHang.ma_don_hang, phuong_thuc_thanh_toan: 'VI_DIEN_TU' },
        }),
        this.tichDiemLoyalty(maNguoiDung, tongTienGoc),
      ]);

      return { message: 'Thanh toan vi dien tu thanh cong', don_hang: donHang, giao_dich: giaoDich };
    }

    if (dto.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
      await Promise.all([
        this.notificationService.taoThongBao({
          ma_nguoi_dung: maNguoiDung,
          tieu_de: dto.delivery_mode === 'GIAO_TAN_NOI' ? 'Don COD cho thu tien' : 'Don cho thanh toan tai quay',
          noi_dung: dto.delivery_mode === 'GIAO_TAN_NOI' 
            ? `Don #${donHang.ma_don_hang} se duoc thu tien khi giao hang.` 
            : `Don #${donHang.ma_don_hang} vui long thanh toan tai quay.`,
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
        qr_fallback_url: this.taoQrNganHangDuPhong(tongTien, maThamChieu),
      },
    };
  }

  async taoDonHangTrucTiep(payload: {
    ma_nguoi_dung?: string;
    phuong_thuc_thanh_toan?: string;
    loai_don_hang?: string;
    chi_tiet_don_hang?: Array<{
      ma_san_pham?: string | number;
      ten_san_pham?: string;
      so_luong: number;
      gia_ban?: number;
      ghi_chu?: string;
      kich_co?: string;
      hinh_anh_url?: string;
      toppings?: string[];
      luong_da?: string;
      do_ngot?: string;
      item_ghi_chu?: string;
    }>;
    ghi_chu?: string;
    dia_chi_giao_hang?: string;
  }) {
    const maNguoiDung = payload.ma_nguoi_dung || 'GUEST';
    const items = payload.chi_tiet_don_hang || [];
    if (!items.length) {
      throw new BadRequestException('Khong co san pham trong don hang');
    }
    const tongTien = items.reduce((sum, item) => sum + Number(item.gia_ban || 0) * Number(item.so_luong || 1), 0);
    const maDonHang = crypto.randomUUID();
    const branchCode = 'CN_Q1';

    const donHang = await this.donHangRepo.save(
      this.donHangRepo.create({
        ma_don_hang: maDonHang,
        ma_nguoi_dung: maNguoiDung,
        co_so_ma: branchCode,
        tong_tien: tongTien,
        dia_chi_giao_hang: payload.dia_chi_giao_hang || 'Tại quán / Giao hàng AI',
        ghi_chu: payload.ghi_chu || 'Đặt qua AI',
        phuong_thuc_thanh_toan: (payload.phuong_thuc_thanh_toan as any) || 'THANH_TOAN_KHI_NHAN_HANG',
        trang_thai_thanh_toan: 'CHO_THANH_TOAN_KHI_NHAN_HANG',
        trang_thai_don_hang: 'MOI_TAO',
        tien_thoi: 0,
        lich_su_trang_thai: [
          {
            loai: 'ORDER',
            trang_thai: 'MOI_TAO',
            thoi_gian: new Date().toISOString(),
            ghi_chu: 'Đơn hàng AI trực tiếp',
          },
        ],
      }),
    );

    const chiTiet = items.map((item) =>
      this.chiTietRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        ma_san_pham: Number(item.ma_san_pham || 1),
        ten_san_pham: item.ten_san_pham || 'Sản phẩm',
        gia_ban: Number(item.gia_ban || 0),
        so_luong: Number(item.so_luong || 1),
        kich_co: item.kich_co || 'Nhỏ',
        hinh_anh_url: item.hinh_anh_url || null,
        toppings: item.toppings || [],
        luong_da: item.luong_da || null,
        do_ngot: item.do_ngot || null,
        ghi_chu: item.item_ghi_chu || item.ghi_chu || null,
      }),
    );
    await this.chiTietRepo.save(chiTiet);

    await this.giaoDichRepo.save(
      this.giaoDichRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        cong_thanh_toan: (payload.phuong_thuc_thanh_toan as any) || 'THANH_TOAN_KHI_NHAN_HANG',
        ma_tham_chieu: `${donHang.ma_don_hang}_AI`,
        so_tien: tongTien,
        trang_thai: 'CHO_THU_TIEN',
      }),
    );

    try {
      await this.notificationService.taoThongBao({
        ma_nguoi_dung: maNguoiDung,
        tieu_de: 'Đơn hàng AI thành công',
        noi_dung: `Đơn #${donHang.ma_don_hang} đã được tạo qua AI thành công. Tổng tiền: ${tongTien.toLocaleString('vi-VN')}đ`,
        loai: 'ORDER',
        du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_don_hang: donHang.trang_thai_don_hang },
      });
    } catch {}

    return {
      success: true,
      message: 'Tạo đơn hàng thành công',
      don_hang: donHang,
      chi_tiet: chiTiet,
    };
  }


  // --- VNPAY LOGIC ---
  private taoUrlVnpayThat(maNguoiDung: string, maDonHang: string, tongTien: number, txnRef: string, clientIp: string) {
    let ipAddr = clientIp || '113.190.232.222';
    if (ipAddr === '::1' || ipAddr === '127.0.0.1' || ipAddr.startsWith('172.') || ipAddr.startsWith('192.168.') || ipAddr.startsWith('10.')) {
        ipAddr = '113.190.232.222';
    }
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
        vnp_OrderInfo: `Thanh toan don hang ${maDonHang.replace(/-/g, '')}`,
        vnp_OrderType: 'billpayment',
        vnp_ReturnUrl: returnUrl,
        vnp_TxnRef: txnRef,
        vnp_ExpireDate: expireDate,
    };

    // Theo chuẩn VNPAY v2.1.0:
    // 1. Dữ liệu băm (signData): Tên tham số URL Encode, Giá trị KHÔNG URL Encode.
    // 2. Chuỗi query trên URL: Cả Tên và Giá trị đều phải URL Encode (theo RFC 3986, khoảng trắng là %20).
    const sortedKeys = Object.keys(params).sort();
    
    // Áp dụng đúng chuẩn VNPay Node.js SDK (dùng trong 99% dự án thực tế):
    // Cả Tên và Giá trị đều URL Encode, thay khoảng trắng thành dấu +
    const signData = sortedKeys
      .map(key => {
        const val = String(params[key]);
        return `${encodeURIComponent(key)}=${encodeURIComponent(val).replace(/%20/g, '+')}`;
      })
      .join('&');

    const hmac = crypto.createHmac('sha512', this.VNP_HASH_SECRET);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    
    // Debug logging
    const maskedSecret = this.VNP_HASH_SECRET.substring(0, 4) + '***' + this.VNP_HASH_SECRET.substring(this.VNP_HASH_SECRET.length - 4);
    require('fs').appendFileSync('/app/error.log', '\n[VNPAY DEBUG] signData: ' + signData + '\n[VNPAY DEBUG] Secret used: ' + maskedSecret + ' (Length: ' + this.VNP_HASH_SECRET.length + ')\n[VNPAY DEBUG] Generated Hash: ' + signed + '\n');
    console.log('[VNPAY DEBUG] signData:', signData);
    console.log('[VNPAY DEBUG] Masked Secret:', maskedSecret, 'Length:', this.VNP_HASH_SECRET.length);

    // urlQuery dùng để gắn lên URL (phải URL Encode giá trị)
    const urlQuery = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');
    const finalUrl = `${this.VNP_URL}?${urlQuery}&vnp_SecureHash=${signed}`;
    
    return finalUrl;
}

  async xuLyVnpayIpn(query: Record<string, string>) {
    const vnp_SecureHash = query.vnp_SecureHash;
    const clone = { ...query };
    delete clone.vnp_SecureHash; delete clone.vnp_SecureHashType;

    const sortedKeys = Object.keys(clone).sort();
    
    const signData = sortedKeys
      .map(key => {
        const val = String(clone[key]);
        return `${encodeURIComponent(key)}=${encodeURIComponent(val).replace(/%20/g, '+')}`;
      })
      .join('&');

    const hmac = crypto.createHmac('sha512', this.VNP_HASH_SECRET);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (signed !== vnp_SecureHash) return { RspCode: '97', Message: 'Invalid signature' };

    if (query.vnp_TxnRef && query.vnp_TxnRef.startsWith('WT_')) {
      if (query.vnp_ResponseCode === '00') {
        const success = await this.customerWalletService.processTopUpSuccess(query.vnp_TxnRef);
        return { RspCode: success ? '00' : '99', Message: success ? 'Confirm Success' : 'Error processing' };
      }
      return { RspCode: '00', Message: 'Confirm Success' };
    }

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
        const promises: Promise<any>[] = [];
        if (donHang.ma_nguoi_dung) {
          promises.push(
            this.notificationService.taoThongBao({
              ma_nguoi_dung: donHang.ma_nguoi_dung,
              tieu_de: 'Thanh toan thanh cong',
              noi_dung: `Don #${donHang.ma_don_hang} da thanh toan thanh cong va duoc xac nhan.`,
              loai: 'PAYMENT',
              du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_thanh_toan: 'DA_THANH_TOAN' },
            }),
            this.tichDiemLoyalty(donHang.ma_nguoi_dung, Number(donHang.tong_tien) + Number(donHang.so_tien_giam || 0)),
          );
        }
        await Promise.all(promises);
      }
    } else {
      giaoDich.trang_thai = 'THAT_BAI';
      await this.capNhatTrangThaiDonHangHeThong(giaoDich.ma_don_hang, {
        trang_thai_thanh_toan: 'THAT_BAI',
        ghi_chu: 'Thanh toan VNPAY that bai',
      });
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: giaoDich.ma_don_hang } });
      if (donHang && donHang.ma_nguoi_dung) {
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
    if (query.vnp_TxnRef && query.vnp_TxnRef.startsWith('WT_')) {
      const ipnResult = await this.xuLyVnpayIpn(query);
      const isSuccess = ipnResult.RspCode === '00' || ipnResult.RspCode === '02';
      return { message: isSuccess ? 'Thanh cong' : 'That bai', is_wallet_tx: true, success: isSuccess };
    }

    const maDonHang = (query.vnp_TxnRef || '').split('_')[0];
    let donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung } });
    if (!donHang) throw new NotFoundException('Khong tim thay don hang');

    if (query.vnp_ResponseCode === '00' && donHang.trang_thai_thanh_toan !== 'DA_THANH_TOAN') {
      const ipnResult = await this.xuLyVnpayIpn(query);
      if (ipnResult.RspCode !== '00' && ipnResult.RspCode !== '02') {
        return { message: 'That bai', don_hang: donHang, is_wallet_tx: false };
      }

      const donHangMoiNhat = await this.donHangRepo.findOne({
        where: { ma_don_hang: maDonHang, ma_nguoi_dung: maNguoiDung },
      });
      if (donHangMoiNhat) {
        donHang = donHangMoiNhat;
      }
    }

    const thanhCong = donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN';
    return { message: thanhCong ? 'Thanh cong' : 'That bai', don_hang: donHang, is_wallet_tx: false, success: thanhCong };
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
        const promises: Promise<any>[] = [];
        if (donHang.ma_nguoi_dung) {
          promises.push(
            this.notificationService.taoThongBao({
              ma_nguoi_dung: donHang.ma_nguoi_dung,
              tieu_de: 'Nhan tien QR thanh cong',
              noi_dung: `Don #${donHang.ma_don_hang} da nhan thanh toan QR va duoc xac nhan.`,
              loai: 'PAYMENT',
              du_lieu: { ma_don_hang: donHang.ma_don_hang, trang_thai_thanh_toan: 'DA_THANH_TOAN' },
            }),
            this.tichDiemLoyalty(donHang.ma_nguoi_dung, Number(donHang.tong_tien) + Number(donHang.so_tien_giam || 0)),
          );
        }
        await Promise.all(promises);
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
      toppings: Array.isArray(item.toppings) ? item.toppings : [],
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

    // ─── RÀNG BUỘC 1: Nhân viên chỉ thao tác trong ca đang mở ───
    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });
    if (!activeShift && (branchCode.startsWith('KSK') || branchCode !== 'MAC_DINH_CHI')) {
      throw new BadRequestException(`Kiosk ${branchCode} hiện chưa mở ca làm việc. Vui lòng thực hiện mở ca trước khi thao tác bán hàng POS!`);
    }

    const isCash = phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG';
    const tienKhachDua = isCash ? Math.max(Number(dto.tien_khach_dua ?? tongTien), 0) : null;
    if (isCash && (tienKhachDua as number) < tongTien) {
      throw new BadRequestException('Tien khach dua khong du de tao don COD');
    }
    const tienThoi = isCash ? Math.max((tienKhachDua as number) - tongTien, 0) : 0;
    const maNguoiDung = dto.ma_nguoi_dung?.trim() || `anon-pos-${Date.now()}`;
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
          toppings: item.toppings,
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
  private async loadMenuImageMaps() {
    try {
      const allMenuProducts = await this.donHangRepo.query(
        `SELECT ma_san_pham, ten_san_pham, hinh_anh_url FROM menu.san_pham WHERE hinh_anh_url IS NOT NULL`,
      );

      const menuImageMap = new Map<string, string>();
      const menuNameImageMap = new Map<string, string>();

      for (const p of allMenuProducts) {
        if (p.hinh_anh_url) {
          menuImageMap.set(String(p.ma_san_pham), p.hinh_anh_url);
          if (p.ten_san_pham) {
            menuNameImageMap.set(String(p.ten_san_pham).trim().toLowerCase(), p.hinh_anh_url);
          }
        }
      }
      return { menuImageMap, menuNameImageMap };
    } catch {
      return { menuImageMap: new Map<string, string>(), menuNameImageMap: new Map<string, string>() };
    }
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
      .where('(don_hang.ma_nguoi_dung = :maNguoiDung OR don_hang.guest_phone = :maNguoiDung OR don_hang.guest_email = :maNguoiDung)', { maNguoiDung });

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

    const limit = boLoc.limit && boLoc.limit > 0 ? Math.min(boLoc.limit, 100) : 50;
    const page = boLoc.page && boLoc.page > 0 ? boLoc.page : 1;
    const skip = (page - 1) * limit;

    const danhSach = await query
      .orderBy('don_hang.ngay_tao', 'DESC')
      .take(limit)
      .skip(skip)
      .getMany();

    const maDonHangs = danhSach.map(d => d.ma_don_hang);
    let trackings: any[] = [];
    if (maDonHangs.length > 0) {
      try {
        trackings = await this.deliveryTrackingService.getTrackingsByOrderIds(maDonHangs);
      } catch (e) {
        console.warn(`Loi getTrackingsByOrderIds: ${e.message}`);
      }
    }

    const { menuImageMap, menuNameImageMap } = await this.loadMenuImageMaps();

    const orders = danhSach.map((don) => {
      const giaoDichSorted = [...(don.giao_dich_thanh_toan || [])].sort(
        (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
      );
      const giaoDichGanNhat = giaoDichSorted[0] || null;
      const tr = trackings.find(t => t.ma_don_hang === don.ma_don_hang);

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
        phuong_thuc_giao_hang: tr?.delivery_method || null,
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
        chi_tiet: (don.chi_tiet || []).map((ct) => {
          let imgUrl = ct.hinh_anh_url;
          if (!imgUrl || imgUrl === '/hc-assets/caphe-1.png') {
            imgUrl =
              menuImageMap.get(String(ct.ma_san_pham)) ||
              menuNameImageMap.get(String(ct.ten_san_pham || '').trim().toLowerCase()) ||
              null;
          }
          return {
            id: ct.id,
            ma_san_pham: ct.ma_san_pham,
            ten_san_pham: ct.ten_san_pham,
            gia_ban: Number(ct.gia_ban),
            so_luong: ct.so_luong,
            hinh_anh_url: imgUrl,
            kich_co: ct.kich_co,
            toppings: ct.toppings,
            luong_da: ct.luong_da,
            do_ngot: ct.do_ngot,
            loai_sua: ct.loai_sua,
            ghi_chu: ct.ghi_chu,
            custom_attributes: ct.custom_attributes,
          };
        }),
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
    await this.redisCacheService.setJson(cacheKey, result, 120).catch(() => undefined); // Tăng từ 45s → 120s
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
    if (boLoc.dateFrom) {
      query.andWhere('don_hang.ngay_tao >= :dateFrom', { dateFrom: new Date(boLoc.dateFrom).toISOString() });
    }
    if (boLoc.dateTo) {
      query.andWhere('don_hang.ngay_tao <= :dateTo', { dateTo: new Date(boLoc.dateTo).toISOString() });
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

    const limit = boLoc.limit && boLoc.limit > 0 ? Math.min(boLoc.limit, 100) : 50;
    const page = boLoc.page && boLoc.page > 0 ? boLoc.page : 1;
    const skip = (page - 1) * limit;

    const danhSach = await query
      .orderBy('don_hang.ngay_tao', 'DESC')
      .addOrderBy('giao_dich.ngay_tao', 'DESC')
      .take(limit)
      .skip(skip)
      .getMany();

    const maDonHangs = danhSach.map(d => d.ma_don_hang);
    let trackings: any[] = [];
    if (maDonHangs.length > 0) {
      trackings = await this.deliveryTrackingService.getTrackingsByOrderIds(maDonHangs);
    }

    const orders = danhSach.map((don) => {
      const giaoDichSorted = [...(don.giao_dich_thanh_toan || [])].sort(
        (a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime(),
      );
      const giaoDichGanNhat = giaoDichSorted[0] || null;
      const tr = trackings.find(t => t.ma_don_hang === don.ma_don_hang);

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
        phuong_thuc_giao_hang: tr?.delivery_method || null,
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
    await this.redisCacheService.setJson(cacheKey, result, 60); // Tăng từ 30s → 60s
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
      nguon_tao: ca.nguon_tao,
      trang_thai_yeu_cau: ca.trang_thai_yeu_cau,
      thoi_gian_gui_yeu_cau: ca.thoi_gian_gui_yeu_cau,
      nguoi_duyet_yeu_cau: ca.nguoi_duyet_yeu_cau,
      ghi_chu_duyet: ca.ghi_chu_duyet,
      thoi_gian_duyet: ca.thoi_gian_duyet,
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
    const prefix = cong === 'NGAN_HANG_QR' ? 'QR' : (cong === 'VI_DIEN_TU' ? 'WALLET' : 'COD');
    return `${prefix}-${maDonHang.slice(0, 8)}-${Date.now().toString().slice(-6)}`;
  }

  private taoQrNganHang(tongTien: number, maThamChieu: string) {
    const amount = Math.round(tongTien);
    return `https://qr.sepay.vn/img?bank=${encodeURIComponent(this.SEPAY_BANK_CODE)}&acc=${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}&template=compact&amount=${amount}&des=${encodeURIComponent(maThamChieu)}`;
  }

  private taoQrNganHangDuPhong(tongTien: number, maThamChieu: string) {
    const amount = Math.round(tongTien);
    return `https://img.vietqr.io/image/${encodeURIComponent(this.SEPAY_BANK_CODE)}-${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(maThamChieu)}`;
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

    const rawItems = Array.isArray(dto.items) ? dto.items : [];
    const suDungCheDoThayTheMon = rawItems.some((item) => item?.ma_san_pham !== undefined);

    let chiTietCapNhat: Array<{
      id?: number;
      ma_san_pham: number;
      ten_san_pham: string;
      so_luong: number;
      gia_ban: number;
      kich_co: string | null;
      hinh_anh_url: string | null;
      toppings?: string[];
      luong_da?: string | null;
      do_ngot?: string | null;
      ghi_chu?: string | null;
    }> = [];

    if (suDungCheDoThayTheMon) {
      if (!rawItems.length) {
        throw new BadRequestException('Don hang phai co it nhat 1 mon');
      }

      const mergeByProductAndSize = new Map<
        string,
        {
          ma_san_pham: number;
          ten_san_pham: string;
          so_luong: number;
          gia_ban: number;
          kich_co: string | null;
          hinh_anh_url: string | null;
          toppings?: string[];
          luong_da?: string | null;
          do_ngot?: string | null;
          ghi_chu?: string | null;
        }
      >();

      for (const item of rawItems) {
        const maSanPham = Number(item?.ma_san_pham);
        const soLuong = Number(item?.so_luong);
        const kichCo = String(item?.kich_co || '').trim() || null;

        if (Number.isNaN(maSanPham) || maSanPham <= 0 || Number.isNaN(soLuong) || soLuong <= 0) {
          throw new BadRequestException('Du lieu mon trong don khong hop le');
        }

        const itemCu = chiTietHienTai.find((x) => Number(x.ma_san_pham) === maSanPham);
        const tenSanPham = String(item?.ten_san_pham || itemCu?.ten_san_pham || '').trim();
        const giaBan = Number(item?.gia_ban ?? itemCu?.gia_ban);
        const hinhAnh = String(item?.hinh_anh_url || itemCu?.hinh_anh_url || '').trim() || null;

        if (!tenSanPham || Number.isNaN(giaBan) || giaBan < 0) {
          throw new BadRequestException('Du lieu mon trong don khong hop le');
        }

        const key = `${maSanPham}__${kichCo || 'NO_SIZE'}`;
        const existed = mergeByProductAndSize.get(key);
        if (existed) {
          existed.so_luong += soLuong;
        } else {
          mergeByProductAndSize.set(key, {
            ma_san_pham: maSanPham,
            ten_san_pham: tenSanPham,
            so_luong: soLuong,
            gia_ban: giaBan,
            kich_co: kichCo,
            hinh_anh_url: hinhAnh,
            toppings: (item as any)?.toppings || itemCu?.toppings || [],
            luong_da: (item as any)?.luong_da || itemCu?.luong_da || null,
            do_ngot: (item as any)?.do_ngot || itemCu?.do_ngot || null,
            ghi_chu: (item as any)?.ghi_chu || itemCu?.ghi_chu || null,
          });
        }
      }

      chiTietCapNhat = Array.from(mergeByProductAndSize.values());
    } else {
      const itemUpdates = new Map(
        rawItems
          .filter((item) => item?.id !== undefined)
          .map((item) => [Number(item.id), Number(item.so_luong)]),
      );

      chiTietCapNhat = chiTietHienTai
        .map((item) => {
          if (!itemUpdates.has(item.id)) {
            return {
              id: item.id,
              ma_san_pham: Number(item.ma_san_pham),
              ten_san_pham: item.ten_san_pham,
              so_luong: Number(item.so_luong),
              gia_ban: Number(item.gia_ban),
              kich_co: item.kich_co || null,
              hinh_anh_url: item.hinh_anh_url || null,
              toppings: item.toppings || [],
              luong_da: item.luong_da || null,
              do_ngot: item.do_ngot || null,
              ghi_chu: item.ghi_chu || null,
            };
          }

          return {
            id: item.id,
            ma_san_pham: Number(item.ma_san_pham),
            ten_san_pham: item.ten_san_pham,
            so_luong: itemUpdates.get(item.id) || 0,
            gia_ban: Number(item.gia_ban),
            kich_co: item.kich_co || null,
            hinh_anh_url: item.hinh_anh_url || null,
            toppings: item.toppings || [],
            luong_da: item.luong_da || null,
            do_ngot: item.do_ngot || null,
            ghi_chu: item.ghi_chu || null,
          };
        })
        .filter((item) => item.so_luong > 0);
    }

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

      if (suDungCheDoThayTheMon) {
        await chiTietRepo.delete({ ma_don_hang: donHang.ma_don_hang });
        const chiTietMoi = chiTietCapNhat.map((item) =>
          chiTietRepo.create({
            ma_don_hang: donHang.ma_don_hang,
            ma_san_pham: item.ma_san_pham,
            ten_san_pham: item.ten_san_pham,
            so_luong: item.so_luong,
            gia_ban: item.gia_ban,
            kich_co: item.kich_co,
            hinh_anh_url: item.hinh_anh_url,
            toppings: (item as any).toppings || [],
            luong_da: (item as any).luong_da || null,
            do_ngot: (item as any).do_ngot || null,
            ghi_chu: (item as any).ghi_chu || null,
          }),
        );
        await chiTietRepo.save(chiTietMoi);
      } else {
        const itemUpdates = new Map(
          rawItems
            .filter((item) => item?.id !== undefined)
            .map((item) => [Number(item.id), Number(item.so_luong)]),
        );
        const chiTietCanXoa = chiTietHienTai.filter((item) => itemUpdates.has(item.id) && (itemUpdates.get(item.id) || 0) <= 0);
        if (chiTietCanXoa.length) {
          await chiTietRepo.remove(chiTietCanXoa);
        }
        await chiTietRepo.save(chiTietCapNhat as ChiTietDonHang[]);
      }

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

      const ngayCapNhat = new Date();
      donHang.tong_tien = tongTienMoi;
      donHang.ngay_cap_nhat = ngayCapNhat;

      await donHangRepo.update(
        { ma_don_hang: donHang.ma_don_hang },
        {
          dia_chi_giao_hang: donHang.dia_chi_giao_hang,
          khung_gio_giao: donHang.khung_gio_giao,
          ghi_chu: donHang.ghi_chu,
          tong_tien: tongTienMoi,
          ngay_cap_nhat: ngayCapNhat,
        },
      );

      if (giaoDichMoiNhat) {
        giaoDichMoiNhat.so_tien = tongTienMoi;
        await giaoDichRepo.save(giaoDichMoiNhat);
      }

      return donHangRepo.findOne({
        where: { ma_don_hang: donHang.ma_don_hang },
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
    await this.guiThongBaoDonHangChoNhanSuChiNhanh({
      branchCode: donHang.co_so_ma,
      title: 'Don hang duoc chinh sua',
      content: `Don #${String(maDonHang || '').slice(0, 8).toUpperCase()} da duoc cap nhat thong tin.`,
      type: 'ORDER',
      data: {
        ma_don_hang: maDonHang,
        co_so_ma: donHang.co_so_ma,
        trang_thai_don_hang: donHang.trang_thai_don_hang,
      },
    });

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
          kich_co: (item as any).kich_co || null,
          hinh_anh_url: (item as any).hinh_anh_url || null,
          toppings: (item as any).toppings || [],
          luong_da: (item as any).luong_da || null,
          do_ngot: (item as any).do_ngot || null,
          ghi_chu: (item as any).ghi_chu || null,
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
    await this.guiThongBaoDonHangChoNhanSuChiNhanh({
      branchCode: donHang.co_so_ma,
      title: 'Don hang duoc staff cap nhat',
      content: `Don #${String(maDonHang || '').slice(0, 8).toUpperCase()} da duoc staff cap nhat thong tin.`,
      type: 'ORDER',
      data: {
        ma_don_hang: maDonHang,
        co_so_ma: donHang.co_so_ma,
        trang_thai_don_hang: donHang.trang_thai_don_hang,
      },
    });

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

    if (!['MOI_TAO', 'DA_HUY'].includes(this.normalizeOrderStatus(donHang.trang_thai_don_hang))) {
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
    await this.guiThongBaoDonHangChoNhanSuChiNhanh({
      branchCode: donHang.co_so_ma,
      title: 'Don hang da bi xoa',
      content: `Don #${String(maDonHang || '').slice(0, 8).toUpperCase()} da duoc xoa khoi he thong cua chi nhanh.`,
      type: 'ORDER',
      data: {
        ma_don_hang: maDonHang,
        co_so_ma: donHang.co_so_ma,
        trang_thai_don_hang: donHang.trang_thai_don_hang,
      },
    });

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

    console.log('[HuyDonHang] Starting cancellation for', maDonHang, 'Payment status:', donHang.trang_thai_thanh_toan, 'Method:', donHang.phuong_thuc_thanh_toan);

    let newTrangThaiThanhToan = donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN' ? donHang.trang_thai_thanh_toan : 'THAT_BAI';

    if (donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
      const phuongThucCanHoan = ['VI_DIEN_TU', 'MOMO', 'ZALOPAY', 'VNPAY', 'NGAN_HANG_QR'];
      if (phuongThucCanHoan.includes(donHang.phuong_thuc_thanh_toan)) {
        await this.customerWalletService.refundBalance(
          maNguoiDung,
          Number(donHang.tong_tien),
          maDonHang
        );
        newTrangThaiThanhToan = 'DA_HOAN_TIEN';
      }
    }

    const updated = await this.capNhatTrangThaiDonHangHeThong(maDonHang, {
      trang_thai_don_hang: 'DA_HUY',
      trang_thai_thanh_toan: newTrangThaiThanhToan,
      ghi_chu: lyDo?.trim() || 'Khach hang huy don',
    });

    await this.notificationService.taoThongBao({
      ma_nguoi_dung: maNguoiDung,
      tieu_de: 'Don hang da huy',
      noi_dung: `Don #${maDonHang} da duoc huy.`,
      loai: 'ORDER',
      du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: 'DA_HUY' },
    });

    await this.invalidateOrderCaches(maNguoiDung, donHang.co_so_ma);

    // Hủy voucher khảo sát pending nếu có
    await this.surveyService.huyVoucherPending(maDonHang).catch((err) => {
      console.error('[HuyDonHang] Error cancelling survey voucher:', err);
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

    if (donHang.ma_nguoi_dung) {
      await this.notificationService.taoThongBao({
        ma_nguoi_dung: donHang.ma_nguoi_dung,
        tieu_de: 'Cap nhat trang thai don hang',
        noi_dung: `Don #${maDonHang} da chuyen sang trang thai ${trangThai}.`,
        loai: 'ORDER',
        du_lieu: { ma_don_hang: maDonHang, trang_thai_don_hang: trangThai },
      });
    }

    return { message: 'Cap nhat trang thai thanh cong', order: updated };
  }

  // Tích điểm loyalty cho user (fire-and-forget — không làm hỏng luồng thanh toán)
  private async tichDiemLoyalty(maNguoiDung: string, tongTienGoc: number): Promise<void> {
    if (!maNguoiDung || maNguoiDung.startsWith('anon-')) return;
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
    const normalizedBranch = this.normalizeBranchCode(branchCode);
    const danhSach = await this.donHangRepo
      .createQueryBuilder('don_hang')
      .leftJoinAndSelect('don_hang.giao_dich_thanh_toan', 'giao_dich')
      .where('don_hang.ngay_tao >= :from', { from: from.toISOString() })
      .andWhere('don_hang.ngay_tao <= :to', { to: to.toISOString() })
      .andWhere('don_hang.co_so_ma = :branchCode', { branchCode: normalizedBranch })
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
      // 1. Loại trừ tuyệt đối các đơn đã bị hủy hoặc hoàn tiền (Refund / Void)
      if (
        order.trang_thai_don_hang === 'DA_HUY' ||
        order.trang_thai_thanh_toan === 'DA_HOAN_TIEN' ||
        order.trang_thai_thanh_toan === 'THAT_BAI'
      ) {
        return;
      }

      const createdAt = new Date(order.ngay_tao);
      if (Number.isNaN(createdAt.getTime())) {
        return;
      }

      const tongTien = Number(order.tong_tien || 0);
      tongDonHopLe += 1;
      doanhThuDonHoanThanh += tongTien;

      const laDonTaiShop = ['TAI_CHO', 'MANG_DI', 'LAY_TAI_QUAN', 'DUNG_TAI_CHO'].includes(
        String(order.loai_don_hang || '').toUpperCase(),
      );
      if (laDonTaiShop) {
        doanhThuTaiShop += tongTien;
      } else {
        doanhThuOnline += tongTien;
      }

      if (order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
        doanhThuKhongTienMat += tongTien;
        return;
      }

      // Đơn tiền mặt tại quầy POS / COD
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
      MOI_TAO: ['DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'DA_HUY'],
      DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DANG_GIAO', 'DA_HUY'],
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

        await this.guiThongBaoDonHangChoNhanSuChiNhanh({
          branchCode: saved.co_so_ma,
          title: 'Cap nhat trang thai don hang',
          content: `Don #${String(saved.ma_don_hang || '').slice(0, 8).toUpperCase()} -> ${this.mapTrangThaiDonHangLabel(saved.trang_thai_don_hang)}.`,
          type: 'ORDER',
          data: {
            ma_don_hang: saved.ma_don_hang,
            co_so_ma: saved.co_so_ma,
            trang_thai_don_hang: saved.trang_thai_don_hang,
            trang_thai_thanh_toan: saved.trang_thai_thanh_toan,
          },
        });

        // Phát voucher khảo sát khi đơn hoàn thành, hủy voucher khi đơn bị hủy
        if (saved.trang_thai_don_hang === 'HOAN_THANH') {
          await this.surveyService.phatVoucherSauHoanThanh(saved.ma_don_hang).catch((err) => {
            console.error('[capNhatTrangThaiDonHangHeThong] Error issuing survey voucher:', err);
          });
        } else if (saved.trang_thai_don_hang === 'DA_HUY') {
          await this.surveyService.huyVoucherPending(saved.ma_don_hang).catch((err) => {
            console.error('[capNhatTrangThaiDonHangHeThong] Error cancelling survey voucher:', err);
          });
        }
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

      if (paymentStatusChanged) {
        await this.guiThongBaoDonHangChoNhanSuChiNhanh({
          branchCode: saved.co_so_ma,
          title: 'Cap nhat thanh toan don hang',
          content: `Don #${String(saved.ma_don_hang || '').slice(0, 8).toUpperCase()} -> ${this.mapTrangThaiThanhToanLabel(saved.trang_thai_thanh_toan)}.`,
          type: 'PAYMENT',
          data: {
            ma_don_hang: saved.ma_don_hang,
            co_so_ma: saved.co_so_ma,
            trang_thai_don_hang: saved.trang_thai_don_hang,
            trang_thai_thanh_toan: saved.trang_thai_thanh_toan,
          },
        });
      }
    }

    return saved;
  }

  taoUrlRedirectFrontEnd(maNguoiDung: string, maDonHang: string, thanhCong: boolean) {
    const webBase = process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
    return `${webBase}/?payment_status=${thanhCong ? 'success' : 'failed'}&ma_don_hang=${maDonHang}`;
  }

  async lienKetDonHangKhach(maNguoiDung: string, maDonHang: string) {
    const order = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!order) {
      throw new NotFoundException('Khong tim thay don hang');
    }

    const currentMaNguoiDung = String(order.ma_nguoi_dung || '');
    if (currentMaNguoiDung.startsWith('anon-') || currentMaNguoiDung === 'anonymous') {
      order.ma_nguoi_dung = maNguoiDung;
      await this.donHangRepo.save(order);
      return { success: true, message: 'Lien ket don hang thanh cong' };
    }

    // If it's already linked to this user, return success too
    if (currentMaNguoiDung === maNguoiDung) {
      return { success: true, message: 'Don hang da duoc lien ket voi tai khoan nay' };
    }

    throw new BadRequestException('Don hang nay da thuoc ve mot tai khoan khac');
  }

  async lienKetDonHangGuest(
    customerId: string,
    payload: { guest_session_id?: string; email?: string; phone?: string; confirmLink?: boolean },
  ) {
    const cleanSession = payload.guest_session_id?.trim();

    // Chỉ tìm theo session_id để tránh đồng bộ sai đơn hàng sang tài khoản khác
    if (!cleanSession) {
      return { success: true, linked: false, count: 0 };
    }

    // Tìm các đơn hàng chưa gán tài khoản khớp với session_id
    const matchedOrders = await this.donHangRepo.createQueryBuilder('don_hang')
      .where(
        '(don_hang.ma_nguoi_dung IS NULL OR don_hang.ma_nguoi_dung = :emptyStr OR don_hang.ma_nguoi_dung LIKE :anonPrefix OR don_hang.ma_nguoi_dung = :anonWord)',
        { emptyStr: '', anonPrefix: 'anon-%', anonWord: 'anonymous' },
      )
      .andWhere('don_hang.session_id = :session', { session: cleanSession })
      .getMany();

    if (matchedOrders.length > 0) {
      if (payload.confirmLink === true) {
        // Thực hiện liên kết thực tế khi người dùng đã xác nhận
        const orderIds = matchedOrders.map((o) => o.ma_don_hang);
        if (orderIds.length > 0) {
          await this.donHangRepo.update(
            { ma_don_hang: In(orderIds) },
            {
              ma_nguoi_dung: customerId,
              guest_email: null,
              guest_phone: null,
              session_id: null,
            },
          );
        }
        return { success: true, linked: true, count: matchedOrders.length };
      } else {
        // Trả về tín hiệu promptLink để Frontend hỏi ý kiến (luôn hiển thị popup hỏi xác nhận)
        return { success: true, promptLink: true, count: matchedOrders.length };
      }
    }

    return { success: true, linked: false, count: 0 };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. QUẢN LÝ CA TRỰC KIOSK & RÀNG BUỘC NGHIỆP VỤ (THÀNH AN)
  // ─────────────────────────────────────────────────────────────

  async moCaKiosk(input: {
    branch_code: string;
    staff_username?: string;
    staff_name?: string;
    cash_open: number;
    note?: string;
  }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const cashOpen = this.chuanHoaSoTien(input.cash_open, 0);

    // ─── RÀNG BUỘC 2: Không cho 2 người mở ca cùng lúc trên 1 Kiosk ───
    const existingOpenShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (existingOpenShift) {
      const opener = existingOpenShift.staff_name || existingOpenShift.staff_username || 'nhân viên khác';
      let openTimeStr = '';
      try {
        const dt = new Date(existingOpenShift.thoi_gian_mo_ca);
        openTimeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} ngày ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
      } catch (e) {
        openTimeStr = 'trước đó';
      }

      throw new BadRequestException(
        `Kiosk ${branchCode} đang có ca làm việc mở bởi nhân viên "${opener}" (mở lúc ${openTimeStr}). Không thể mở 2 ca cùng lúc trên 1 Kiosk! Vui lòng yêu cầu chốt ca trước khi mở ca mới.`,
      );
    }

    const newShift = this.kioskShiftSessionRepo.create({
      co_so_ma: branchCode,
      staff_username: input.staff_username?.trim() || null,
      staff_name: input.staff_name?.trim() || input.staff_username?.trim() || 'Nhân viên Kiosk',
      trang_thai: 'OPEN',
      thoi_gian_mo_ca: new Date(),
      tien_dau_ca: cashOpen,
      tien_cuoi_ca: null,
      tien_mat_he_thong: 0,
      doanh_thu_he_thong: 0,
      tien_mat_ky_vong: cashOpen,
      chenh_lech: null,
      tong_don_hang: 0,
      tong_don_tien_mat: 0,
      ghi_chu: input.note?.trim() || null,
      du_lieu_chi_tiet: {},
    });

    const saved = await this.kioskShiftSessionRepo.save(newShift);

    return {
      message: `Mở ca làm việc tại Kiosk ${branchCode} thành công!`,
      shift: saved,
    };
  }

  async chotCaKiosk(input: {
    branch_code: string;
    cash_close: number;
    note?: string;
    staff_username?: string;
  }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const cashClose = this.chuanHoaSoTien(input.cash_close, 0);

    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (!activeShift) {
      throw new BadRequestException(`Kiosk ${branchCode} hiện không có ca làm việc nào đang mở để chốt ca.`);
    }

    const now = new Date();
    const startTime = new Date(activeShift.thoi_gian_mo_ca);

    // Tính toán tổng kết doanh số các đơn hàng trong phiên ca
    const tongHop = await this.tinhTongHopDoiSoat(startTime, now, branchCode);

    const tienDauCa = Number(activeShift.tien_dau_ca || 0);
    const tienMatHeThong = tongHop.tienMatThucThu || 0;
    const tienMatKyVong = tienDauCa + tienMatHeThong;
    const chenhLech = cashClose - tienMatKyVong;

    activeShift.trang_thai = 'CLOSED';
    activeShift.thoi_gian_dong_ca = now;
    activeShift.tien_cuoi_ca = cashClose;
    activeShift.tien_mat_he_thong = tienMatHeThong;
    activeShift.doanh_thu_he_thong = tongHop.doanhThuDonHoanThanh || 0;
    activeShift.tien_mat_ky_vong = tienMatKyVong;
    activeShift.chenh_lech = chenhLech;
    activeShift.tong_don_hang = tongHop.tongDon || 0;
    activeShift.tong_don_tien_mat = tongHop.tongDonTienMat || 0;
    activeShift.ghi_chu = input.note?.trim() || activeShift.ghi_chu;
    activeShift.du_lieu_chi_tiet = {
      non_cash_revenue: tongHop.doanhThuKhongTienMat,
      cash_in_gross: tongHop.tienMatThuVao,
      cash_change_out: tongHop.tienThoi,
      online_revenue: tongHop.doanhThuOnline,
      in_store_revenue: tongHop.doanhThuTaiShop,
    };

    const updated = await this.kioskShiftSessionRepo.save(activeShift);

    return {
      message: `Chốt ca làm việc Kiosk ${branchCode} thành công!`,
      shift: updated,
    };
  }

  async cuongCheChotCaKiosk(input: {
    branch_code: string;
    reason?: string;
    manager_username?: string;
  }) {
    const branchCode = this.normalizeBranchCode(input.branch_code);

    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (!activeShift) {
      throw new BadRequestException(`Kiosk ${branchCode} không có ca làm việc nào đang mở để cưỡng chế đóng.`);
    }

    const now = new Date();
    const startTime = new Date(activeShift.thoi_gian_mo_ca);
    const tongHop = await this.tinhTongHopDoiSoat(startTime, now, branchCode);

    const tienDauCa = Number(activeShift.tien_dau_ca || 0);
    const tienMatHeThong = tongHop.tienMatThucThu || 0;

    activeShift.trang_thai = 'FORCE_CLOSED';
    activeShift.thoi_gian_dong_ca = now;
    activeShift.dong_ca_boi = input.manager_username || 'Admin / Franchisee';
    activeShift.tien_mat_he_thong = tienMatHeThong;
    activeShift.doanh_thu_he_thong = tongHop.doanhThuDonHoanThanh || 0;
    activeShift.tien_mat_ky_vong = tienDauCa + tienMatHeThong;
    activeShift.tong_don_hang = tongHop.tongDon || 0;
    activeShift.tong_don_tien_mat = tongHop.tongDonTienMat || 0;
    activeShift.ghi_chu = `[Cưỡng chế đóng ca bởi ${input.manager_username || 'Admin'}] ${input.reason || 'Bàn giao ca cho nhân viên mới'}`;
    activeShift.du_lieu_chi_tiet = {
      non_cash_revenue: tongHop.doanhThuKhongTienMat,
      cash_in_gross: tongHop.tienMatThuVao,
      cash_change_out: tongHop.tienThoi,
      online_revenue: tongHop.doanhThuOnline,
      in_store_revenue: tongHop.doanhThuTaiShop,
    };

    const updated = await this.kioskShiftSessionRepo.save(activeShift);

    return {
      message: `Đã cưỡng chế chốt ca Kiosk ${branchCode} thành công! Kiosk đã sẵn sàng để mở ca mới.`,
      shift: updated,
    };
  }

  async layCaKioskDangMo(branchCodeRaw: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);

    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (!activeShift) {
      return {
        has_open_shift: false,
        active_shift: null,
        live_stats: null,
      };
    }

    const now = new Date();
    const startTime = new Date(activeShift.thoi_gian_mo_ca);
    const tongHop = await this.tinhTongHopDoiSoat(startTime, now, branchCode);

    const tienDauCa = Number(activeShift.tien_dau_ca || 0);
    const tienMatHeThong = tongHop.tienMatThucThu || 0;
    const tienMatKyVong = tienDauCa + tienMatHeThong;

    return {
      has_open_shift: true,
      active_shift: {
        ...activeShift,
        tien_dau_ca: tienDauCa,
      },
      live_stats: {
        total_orders: tongHop.tongDon || 0,
        total_revenue: tongHop.doanhThuDonHoanThanh || 0,
        cash_orders: tongHop.tongDonTienMat || 0,
        cash_revenue: tienMatHeThong,
        non_cash_revenue: tongHop.doanhThuKhongTienMat || 0,
        expected_cash: tienMatKyVong,
        duration_minutes: Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 60000)),
      },
    };
  }

  async layLichSuCaKiosk(branchCodeRaw?: string, limit = 30) {
    const query = this.kioskShiftSessionRepo.createQueryBuilder('s');

    if (branchCodeRaw && branchCodeRaw.trim() && branchCodeRaw !== 'ALL') {
      query.andWhere('s.co_so_ma = :code', { code: this.normalizeBranchCode(branchCodeRaw) });
    }

    query.orderBy('s.thoi_gian_mo_ca', 'DESC').limit(limit);
    const shifts = await query.getMany();

    return shifts.map((s) => ({
      ...s,
      tien_dau_ca: Number(s.tien_dau_ca || 0),
      tien_cuoi_ca: s.tien_cuoi_ca !== null ? Number(s.tien_cuoi_ca) : null,
      tien_mat_he_thong: Number(s.tien_mat_he_thong || 0),
      doanh_thu_he_thong: Number(s.doanh_thu_he_thong || 0),
      tien_mat_ky_vong: Number(s.tien_mat_ky_vong || 0),
      chenh_lech: s.chenh_lech !== null ? Number(s.chenh_lech) : null,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 6. HOÀN / HỦY ĐƠN HÀNG POS TẠI KIOSK (REFUND / VOID) (THÀNH AN)
  // ─────────────────────────────────────────────────────────────

  async kiemTraHopLeHoanHuyPos(maDonHang: string, branchCodeRaw?: string) {
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang, co_so_ma: branchCode },
    });

    if (!donHang) {
      return {
        hop_le: false,
        ly_do: 'Không tìm thấy đơn hàng tại chi nhánh này',
        active_shift: null,
      };
    }

    if (donHang.trang_thai_don_hang === 'DA_HUY' || donHang.trang_thai_thanh_toan === 'DA_HOAN_TIEN') {
      return {
        hop_le: false,
        ly_do: 'Đơn hàng này đã được hủy/hoàn tiền trước đó',
        active_shift: null,
      };
    }

    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (!activeShift) {
      return {
        hop_le: false,
        ly_do: 'Kiosk hiện chưa mở ca làm việc hoặc ca đã chốt',
        active_shift: null,
      };
    }

    const orderCreatedTime = new Date(donHang.ngay_tao).getTime();
    const shiftOpenTime = new Date(activeShift.thoi_gian_mo_ca).getTime();

    if (orderCreatedTime < shiftOpenTime) {
      return {
        hop_le: false,
        ly_do: 'Đơn hàng này thuộc về ca làm việc trước đã chốt',
        active_shift: {
          id: activeShift.id,
          staff_name: activeShift.staff_name,
          thoi_gian_mo_ca: activeShift.thoi_gian_mo_ca,
        },
      };
    }

    return {
      hop_le: true,
      ly_do: '',
      active_shift: {
        id: activeShift.id,
        staff_name: activeShift.staff_name,
        thoi_gian_mo_ca: activeShift.thoi_gian_mo_ca,
      },
    };
  }

  async hoanHuyDonHangPos(
    maDonHang: string,
    input: {
      reason: string;
      branch_code?: string;
      staff_username?: string;
      staff_name?: string;
    },
  ) {
    const branchCode = this.normalizeBranchCode(input.branch_code);
    const reason = String(input.reason || '').trim();
    if (!reason) {
      throw new BadRequestException('Vui lòng cung cấp lý do hoàn/hủy đơn hàng POS!');
    }

    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang, co_so_ma: branchCode },
      relations: ['chi_tiet', 'giao_dich_thanh_toan'],
    });

    if (!donHang) {
      throw new NotFoundException(`Không tìm thấy đơn hàng #${maDonHang.slice(0, 8)} tại chi nhánh này.`);
    }

    if (donHang.trang_thai_don_hang === 'DA_HUY' || donHang.trang_thai_thanh_toan === 'DA_HOAN_TIEN') {
      throw new BadRequestException('Đơn hàng này đã được hủy/hoàn tiền trước đó!');
    }

    // ─── RÀNG BUỘC 1: Phải có ca Kiosk đang mở ───
    const activeShift = await this.kioskShiftSessionRepo.findOne({
      where: { co_so_ma: branchCode, trang_thai: 'OPEN' },
    });

    if (!activeShift) {
      throw new BadRequestException(
        `Kiosk ${branchCode} hiện chưa mở ca làm việc hoặc ca đã chốt. Chỉ được phép hoàn/hủy đơn hàng trong ca đang mở!`,
      );
    }

    // ─── RÀNG BUỘC 2: Đơn hàng phải được tạo trong cùng ca đang mở ───
    const orderCreatedTime = new Date(donHang.ngay_tao).getTime();
    const shiftOpenTime = new Date(activeShift.thoi_gian_mo_ca).getTime();

    if (orderCreatedTime < shiftOpenTime) {
      const shiftDateFormatted = new Date(activeShift.thoi_gian_mo_ca).toLocaleString('vi-VN');
      throw new BadRequestException(
        `Đơn hàng #${maDonHang.slice(0, 8).toUpperCase()} được tạo trước phiên ca hiện tại (mở lúc ${shiftDateFormatted}). Không thể hoàn/hủy đơn của ca đã chốt!`,
      );
    }

    const tongTien = Number(donHang.tong_tien || 0);
    const wasPaid = donHang.trang_thai_thanh_toan === 'DA_THANH_TOAN';
    const nextPaymentStatus = wasPaid ? 'DA_HOAN_TIEN' : 'THAT_BAI';
    const staffDisplayName = input.staff_name || input.staff_username || 'Nhân viên Kiosk';

    const updatedOrder = await this.donHangRepo.manager.transaction(async (manager) => {
      const donHangRepo = manager.getRepository(DonHang);
      const giaoDichRepo = manager.getRepository(GiaoDichThanhToan);

      const lichSu: LichSuTrangThai[] = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
      const nowIso = new Date().toISOString();

      lichSu.push({
        loai: 'ORDER',
        trang_thai: 'DA_HUY',
        thoi_gian: nowIso,
        ghi_chu: `[Hoàn/Hủy POS - ${staffDisplayName}] Lý do: ${reason}`,
      });

      lichSu.push({
        loai: 'PAYMENT',
        trang_thai: nextPaymentStatus,
        thoi_gian: nowIso,
        ghi_chu: wasPaid
          ? `[Hoàn tiền mặt tại quầy Kiosk] Xuất quỹ quầy hoàn trả: ${tongTien.toLocaleString('vi-VN')} đ`
          : '[Hủy giao dịch quầy chưa thanh toán]',
      });

      donHang.trang_thai_don_hang = 'DA_HUY';
      donHang.trang_thai_thanh_toan = nextPaymentStatus;
      donHang.ghi_chu = donHang.ghi_chu ? `${donHang.ghi_chu} | [HỦY POS]: ${reason}` : `[HỦY POS]: ${reason}`;
      donHang.lich_su_trang_thai = lichSu;
      donHang.ngay_cap_nhat = new Date();

      const saved = await donHangRepo.save(donHang);

      // Cập nhật giao dịch thanh toán
      const latestTxn = await giaoDichRepo.findOne({
        where: { ma_don_hang: maDonHang },
        order: { ngay_tao: 'DESC' },
      });
      if (latestTxn) {
        latestTxn.trang_thai = nextPaymentStatus;
        await giaoDichRepo.save(latestTxn);
      }

      return saved;
    });

    // Hủy voucher khảo sát pending (nếu có)
    await this.surveyService.huyVoucherPending(maDonHang).catch(() => {});

    // Xóa cache
    await this.invalidateOrderCaches(updatedOrder.ma_nguoi_dung, updatedOrder.co_so_ma);

    // Bắn sự kiện RabbitMQ & thông báo nội bộ
    await this.rabbitMqService.publish('order.status.changed', {
      orderId: updatedOrder.ma_don_hang,
      userId: updatedOrder.ma_nguoi_dung,
      branchCode: updatedOrder.co_so_ma,
      totalAmount: Number(updatedOrder.tong_tien || 0),
      status: 'DA_HUY',
      paymentStatus: nextPaymentStatus,
      action: 'POS_REFUND_VOID',
      reason,
      refundAmount: wasPaid ? tongTien : 0,
      refundMethod: 'TIEN_MAT_TAI_QUAY',
    });

    await this.guiThongBaoDonHangChoNhanSuChiNhanh({
      branchCode: updatedOrder.co_so_ma,
      title: 'Hoàn/Hủy đơn hàng POS tại Kiosk',
      content: `Đơn #${maDonHang.slice(0, 8).toUpperCase()} đã được ${staffDisplayName} hoàn/hủy. Xuất quỹ tiền mặt: ${wasPaid ? tongTien.toLocaleString('vi-VN') + ' đ' : '0 đ'}. Lý do: ${reason}`,
      type: 'ORDER',
      data: {
        ma_don_hang: maDonHang,
        co_so_ma: updatedOrder.co_so_ma,
        trang_thai_don_hang: 'DA_HUY',
        trang_thai_thanh_toan: nextPaymentStatus,
      },
    });

    return {
      message: 'Hoàn tiền mặt và hủy giao dịch POS thành công!',
      order: updatedOrder,
      shift: activeShift,
      refund_amount: wasPaid ? tongTien : 0,
      refund_method: 'TIEN_MAT_TAI_QUAY',
    };
  }
}