import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Shipper } from './entities/shipper.entity';
import { ShipperDelivery } from './entities/shipper-delivery.entity';
import { ShipperWallet } from './entities/shipper-wallet.entity';
import { ShipperSchedule } from './entities/shipper-schedule.entity';
import { ShipperException } from './entities/shipper-exception.entity';
import { ShipperCodRemit } from './entities/shipper-cod-remit.entity';
import { DonHang } from '../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../thanh-toan/entities/chi-tiet-don-hang.entity';
import { DeliveryTracking } from './features_thaian/delivery-tracking.entity';
import { NotificationGateway } from '../notification/notification.gateway';
import { RedisCacheService } from '../../infrastructure/cache/redis-cache.service';

@Injectable()
export class ShipperService {
  constructor(
    @InjectRepository(Shipper) private shipperRepo: Repository<Shipper>,
    @InjectRepository(ShipperDelivery) private deliveryRepo: Repository<ShipperDelivery>,
    @InjectRepository(ShipperWallet) private walletRepo: Repository<ShipperWallet>,
    @InjectRepository(ShipperSchedule) private scheduleRepo: Repository<ShipperSchedule>,
    @InjectRepository(ShipperException) private exceptionRepo: Repository<ShipperException>,
    @InjectRepository(ShipperCodRemit) private codRemitRepo: Repository<ShipperCodRemit>,
    @InjectRepository(DonHang) private donHangRepo: Repository<DonHang>,
    @InjectRepository(ChiTietDonHang) private chiTietRepo: Repository<ChiTietDonHang>,
    @InjectRepository(DeliveryTracking) private trackingRepo: Repository<DeliveryTracking>,
    private readonly notificationGateway: NotificationGateway,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  private branchCache: { data: any[]; expiresAt: number } | null = null;
  private readonly IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';

  async layDanhSachChiNhanh(): Promise<any[]> {
    const now = Date.now();
    if (this.branchCache && this.branchCache.expiresAt > now && this.branchCache.data?.length > 0) {
      return this.branchCache.data;
    }
    try {
      let response = await fetch(`${this.IDENTITY_SERVICE_URL}/users/branches/public`).catch(() => null);
      if (!response || !response.ok) {
        response = await fetch(`${this.IDENTITY_SERVICE_URL}/branches/public`).catch(() => null);
      }
      if (response && response.ok) {
        const json: any = await response.json();
        const list = Array.isArray(json) ? json : (json.items || json.branches || json.data || []);
        if (list.length > 0) {
          this.branchCache = { data: list, expiresAt: now + 15 * 60 * 1000 };
          return list;
        }
      }
    } catch (err: any) {
      console.warn('[SHIPPER-SERVICE] Could not load branches from identity-service:', err?.message || err);
    }
    return this.branchCache?.data || [];
  }

  normalizeBranchKey(str?: string | null): string {
    if (!str) return '';
    return String(str)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(AVENGERS|HIGHLANDS|CN|KVT|COSO|CHINHANH|STORE|BRANCH)[_\-\s:—–]*/gi, '')
      .replace(/^(HCM|HN|DN|SG|BD|BNIN|HP|VT)[_\-\s:]*/gi, '')
      .replace(/[_\-\s,.:—–]/g, '');
  }

  checkBranchMatch(branchCodeA?: string | null, branchCodeB?: string | null, branches: any[] = []): boolean {
    if (!branchCodeA || !branchCodeB) return false;
    const rawA = String(branchCodeA).trim().toUpperCase();
    const rawB = String(branchCodeB).trim().toUpperCase();
    if (rawA === rawB) return true;

    const repA = rawA.replace(/[-_\s]/g, '_');
    const repB = rawB.replace(/[-_\s]/g, '_');
    if (repA === repB) return true;

    const keyA = this.normalizeBranchKey(rawA);
    const keyB = this.normalizeBranchKey(rawB);
    if (keyA && keyB && keyA === keyB) {
      return true;
    }

    if (branches.length > 0) {
      const matchA = branches.find((b) => {
        const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '').trim().toUpperCase();
        return bCode === rawA || bCode.replace(/[-_\s]/g, '_') === repA || (keyA && this.normalizeBranchKey(bCode) === keyA);
      });
      const matchB = branches.find((b) => {
        const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '').trim().toUpperCase();
        return bCode === rawB || bCode.replace(/[-_\s]/g, '_') === repB || (keyB && this.normalizeBranchKey(bCode) === keyB);
      });
      if (matchA && matchB) {
        const codeA = String(matchA.ma_chi_nhanh || matchA.co_so_ma || matchA.branch_code || '').trim().toUpperCase();
        const codeB = String(matchB.ma_chi_nhanh || matchB.co_so_ma || matchB.branch_code || '').trim().toUpperCase();
        if (codeA && codeB && codeA === codeB) {
          return true;
        }
      }
    }

    return false;
  }

  getPossibleBranchCodes(branchCode?: string | null, branches: any[] = []): string[] {
    if (!branchCode) return [];
    const raw = String(branchCode).trim().toUpperCase();
    const rep = raw.replace(/[-_\s]/g, '_');
    const hyphen = raw.replace(/[-_\s]/g, '-');
    const key = this.normalizeBranchKey(raw);

    const codes = new Set<string>([raw, rep, hyphen]);

    for (const b of branches) {
      const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '').trim().toUpperCase();
      const bKey = this.normalizeBranchKey(bCode);
      if (bCode === raw || bCode.replace(/[-_\s]/g, '_') === rep || (bKey && key && bKey === key)) {
        if (bCode) {
          codes.add(bCode);
          codes.add(bCode.replace(/[-_\s]/g, '_'));
          codes.add(bCode.replace(/[-_\s]/g, '-'));
        }
      }
    }

    return Array.from(codes).filter(Boolean);
  }

  resolveBranchInfoSync(branchCode?: string, branches: any[] = []) {
    if (!branchCode) {
      return {
        store_name: 'Avengers Coffee',
        store_address: 'Hệ thống Avengers Coffee, TP. Hồ Chí Minh',
        latitude: 10.798093,
        longitude: 106.710982,
      };
    }

    const cleanCode = String(branchCode).trim().toUpperCase();
    const normKey = cleanCode.replace(/[_\-\s]/g, '');

    const found = branches.find((b) => {
      const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || b.id || '').trim().toUpperCase();
      const bNorm = bCode.replace(/[_\-\s]/g, '');
      const bName = String(b.ten_chi_nhanh || '').trim().toUpperCase();
      return bCode === cleanCode || bNorm === normKey || bName.includes(cleanCode) || bName.replace(/[_\-\s]/g, '').includes(normKey);
    });

    if (found) {
      return {
        store_name: found.ten_chi_nhanh || `Avengers Coffee - ${cleanCode}`,
        store_address: found.dia_chi ? `${found.dia_chi}${found.thanh_pho ? ', ' + found.thanh_pho : ''}` : 'TP. Hồ Chí Minh',
        latitude: found.vi_do ? Number(found.vi_do) : null,
        longitude: found.kinh_do ? Number(found.kinh_do) : null,
      };
    }

    // Generic parse nếu mã chưa có trong DB (tổng quát, không hardcode)
    const readable = cleanCode
      .replace(/^(HCM|HN|DN|SG|CN|KVT|HC)[_\-]?/i, '')
      .replace(/[_\-]+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\S/g, (l) => l.toUpperCase());

    const finalName = readable ? `Avengers Coffee - Chi nhánh ${readable}` : 'Avengers Coffee';
    return {
      store_name: finalName,
      store_address: `Cửa hàng ${finalName}`,
      latitude: null,
      longitude: null,
    };
  }

  async getBranchInfo(branchCode?: string) {
    const branches = await this.layDanhSachChiNhanh();
    return this.resolveBranchInfoSync(branchCode, branches);
  }

  async login(username: string, password: string) {
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '').trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new BadRequestException('Username and password are required');
    }

    const demoPassword = String(process.env.SHIPPER_DEMO_PASSWORD || '123456').trim();

    let shipper = await this.shipperRepo.findOne({ where: { username: normalizedUsername } });

    if (!shipper) {
      if (normalizedPassword !== demoPassword) {
        throw new UnauthorizedException('Thông tin đăng nhập tài xế không hợp lệ');
      }
      const usernameSlug = normalizedUsername.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || 'shipper';
      shipper = this.shipperRepo.create({
        username: normalizedUsername,
        full_name: `Shipper ${usernameSlug}`,
        phone: `09${Date.now().toString().slice(-8)}`,
        email: null,
        status: 'ACTIVE',
        branch_code: 'HCM_DIEN_BIEN_PHU',
        rating: 4.8,
        password: normalizedPassword,
      });
      shipper = await this.shipperRepo.save(shipper);
    } else {
      const validPassword =
        (shipper.password && normalizedPassword === String(shipper.password).trim()) ||
        normalizedPassword === demoPassword;
      if (!validPassword) {
        throw new UnauthorizedException('Mật khẩu đăng nhập tài xế không chính xác');
      }
    }

    return {
      accessToken: `shipper-token-${shipper.id}`,
      access_token: `shipper-token-${shipper.id}`,
      shipper,
    };
  }

  // ============ SHIPPER MANAGEMENT ============

  async getShipperProfile(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    return shipper;
  }

  async updateShipperLocation(shipperId: string, latitude: number, longitude: number) {
    const numLat = Number(latitude);
    const numLng = Number(longitude);

    await this.shipperRepo.update(
      { id: shipperId },
      { current_latitude: numLat, current_longitude: numLng, status: 'ACTIVE' },
    );

    // Broadcast vị trí tài xế qua WebSocket tới khách và xóa cache Redis để thông tin luôn cập nhật tức thì
    try {
      const activeDeliveries = await this.deliveryRepo.find({
        where: [
          { shipper_id: shipperId, status: 'CONFIRMED' },
          { shipper_id: shipperId, status: 'PICKING_UP' },
          { shipper_id: shipperId, status: 'IN_TRANSIT' },
        ],
      });

      for (const d of activeDeliveries) {
        if (d.ma_don_hang) {
          const tracking = await this.trackingRepo.findOne({ where: { ma_don_hang: d.ma_don_hang } });
          const trackingCode = tracking?.tracking_code || null;

          if (this.redisCacheService) {
            await this.redisCacheService.delete(`delivery_lookup:${d.ma_don_hang.toUpperCase()}`).catch(() => {});
            if (trackingCode) {
              await this.redisCacheService.delete(`delivery_lookup:${trackingCode.toUpperCase()}`).catch(() => {});
            }
          }

          if (this.notificationGateway) {
            this.notificationGateway.guiViTriShipper(d.ma_don_hang, trackingCode, {
              latitude: numLat,
              longitude: numLng,
              shipper_id: shipperId,
              status: d.status,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch {}

    return { success: true, message: 'Location updated' };
  }

  async updateShipperStatus(shipperId: string, status: 'ACTIVE' | 'INACTIVE' | 'ON_BREAK') {
    await this.shipperRepo.update({ id: shipperId }, { status });
    return { success: true, status };
  }

  // ============ AVAILABLE ORDERS POOL (Đơn chờ Shipper nhận) ============

  /**
   * Lấy danh sách đơn hàng trạng thái DANG_GIAO và chưa có shipper nào đang giao.
   * Shipper nhìn thấy pool này và tự nhận (self-assign).
   * Phân quyền nghiêm ngặt theo chi nhánh: Shipper chỉ thấy đơn thuộc cơ sở của mình.
   */
  async getAvailableOrders(branchCode?: string, shipperId?: string) {
    const branches = await this.layDanhSachChiNhanh();
    let effectiveBranch = branchCode ? String(branchCode).trim() : '';

    if (shipperId) {
      const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
      if (!shipper || !shipper.branch_code) {
        // Tài xế chưa được gán chi nhánh -> tuyệt đối không xem đơn chi nhánh khác
        return [];
      }
      effectiveBranch = shipper.branch_code.trim();
    }

    if (!effectiveBranch) {
      // Không có chi nhánh cụ thể -> trả về rỗng để bảo vệ tính đóng gói theo chi nhánh
      return [];
    }

    // Chỉ lấy delivery records ĐANG ACTIVE (chưa kết thúc)
    const activeDeliveries = await this.deliveryRepo
      .createQueryBuilder('d')
      .select(['d.ma_don_hang'])
      .where('d.status IN (:...activeStatuses)', { activeStatuses: ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'] })
      .getMany();

    const activeOrderIds = activeDeliveries.map((d) => d.ma_don_hang).filter((id) => !!id);

    // Query đơn DANG_GIAO chưa được assign (hoặc đơn đã có delivery nhưng bị huỷ/thất bại)
    let query = this.donHangRepo
      .createQueryBuilder('don')
      .leftJoinAndSelect('don.chi_tiet', 'chi_tiet')
      .where('don.trang_thai_don_hang = :status', { status: 'DANG_GIAO' });

    if (activeOrderIds.length > 0) {
      query = query.andWhere('don.ma_don_hang NOT IN (:...activeIds)', { activeIds: activeOrderIds });
    }

    // Phân quyền nghiêm ngặt theo cơ sở: Shipper chỉ thấy đơn thuộc cơ sở của mình
    const possibleCodes = this.getPossibleBranchCodes(effectiveBranch, branches);
    query = query.andWhere(
      "(UPPER(REPLACE(don.co_so_ma, '-', '_')) IN (:...possibleCodes) OR UPPER(don.co_so_ma) IN (:...possibleCodes))",
      { possibleCodes },
    );

    query = query.orderBy('don.ngay_tao', 'DESC');

    const orders = await query.getMany();

    // Lọc lại lần cuối bằng checkBranchMatch để bảo đảm 100% không lọt đơn chi nhánh khác
    const matchedOrders = orders.filter((o) => this.checkBranchMatch(effectiveBranch, o.co_so_ma, branches));

    // Lấy tracking data cho tất cả đơn để kèm toạ độ thật
    const orderIds = matchedOrders.map((o) => o.ma_don_hang);
    const trackings = orderIds.length > 0
      ? await this.trackingRepo.createQueryBuilder('t')
          .where('t.ma_don_hang IN (:...orderIds)', { orderIds })
          .getMany()
      : [];
    const trackingMap = new Map(trackings.map((t) => [t.ma_don_hang, t]));

    return matchedOrders.map((o) => {
      const tr = trackingMap.get(o.ma_don_hang);
      const branchInfo = this.resolveBranchInfoSync(o.co_so_ma, branches);

      return {
        id: o.ma_don_hang,
        ma_don_hang: o.ma_don_hang,
        delivery_address: o.dia_chi_giao_hang,
        pickup_address: branchInfo.store_address,
        store_name: branchInfo.store_name,
        store_address: branchInfo.store_address,
        cod_amount: o.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(o.tong_tien || 0) : 0,
        order_value: Number(o.tong_tien || 0),
        delivery_fee: 15000,
        estimated_time: 30,
        distance_km: null,
        phuong_thuc_thanh_toan: o.phuong_thuc_thanh_toan,
        branch_code: o.co_so_ma,
        trang_thai: o.trang_thai_don_hang,
        tracking: tr ? {
          store_latitude: tr.store_latitude || branchInfo.latitude,
          store_longitude: tr.store_longitude || branchInfo.longitude,
          destination_latitude: tr.destination_latitude,
          destination_longitude: tr.destination_longitude,
          branch_code: tr.branch_code || o.co_so_ma,
        } : (branchInfo.latitude && branchInfo.longitude ? {
          store_latitude: branchInfo.latitude,
          store_longitude: branchInfo.longitude,
          destination_latitude: null,
          destination_longitude: null,
          branch_code: o.co_so_ma,
        } : null),
        items: (o.chi_tiet || []).map((item) => ({
          ten_san_pham: item.ten_san_pham,
          so_luong: item.so_luong,
          gia_ban: Number(item.gia_ban),
          kich_co: item.kich_co,
        })),
        assigned_at: o.ngay_tao,
      };
    });
  }

  /**
   * Shipper tự nhận đơn: Tạo ShipperDelivery record và link với đơn hàng.
   * Chấp nhận cả đơn DANG_GIAO và DANG_CHUAN_BI (tự động nâng cấp lên DANG_GIAO).
   * Nếu đơn đã được shipper khác đang active nhận → throw error.
   */
  async acceptOrder(shipperId: string, maDonHang: string) {
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang },
      relations: ['chi_tiet'],
    });

    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new NotFoundException('Tài xế không tồn tại');

    if (!shipper.branch_code) {
      throw new BadRequestException('Tài xế chưa được phân bổ chi nhánh hoạt động. Vui lòng liên hệ quản lý.');
    }

    if (!donHang.co_so_ma) {
      throw new BadRequestException('Đơn hàng không có thông tin chi nhánh hợp lệ.');
    }

    const branches = await this.layDanhSachChiNhanh();
    const isMatch = this.checkBranchMatch(shipper.branch_code, donHang.co_so_ma, branches);
    if (!isMatch) {
      throw new BadRequestException(`Bạn là tài xế trực thuộc cơ sở ${shipper.branch_code}, không thể nhận đơn hàng của cơ sở ${donHang.co_so_ma}.`);
    }

    const acceptableStatuses = ['DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'];
    if (!acceptableStatuses.includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Đơn hàng không thể nhận ở trạng thái ${donHang.trang_thai_don_hang}`);
    }

    // Kiểm tra xem đã có shipper khác đang ACTIVE nhận chưa
    const existing = await this.deliveryRepo.findOne({
      where: { ma_don_hang: maDonHang },
    });

    if (existing && ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'].includes(existing.status)) {
      if (existing.shipper_id === shipperId) {
        // Shipper này đã nhận rồi → trả về delivery hiện tại
        return { success: true, delivery: existing, message: 'Bạn đã nhận đơn này rồi' };
      }
      throw new BadRequestException('Đơn hàng này đã được Shipper khác nhận');
    }

    // Hủy delivery record cũ nếu có (FAILED/CANCELLED/DELIVERED)
    if (existing) {
      await this.deliveryRepo.update({ id: existing.id }, { status: 'CANCELLED' });
    }

    // Lấy thông tin chi nhánh thực tế từ database
    const branchInfo = await this.getBranchInfo(donHang.co_so_ma);

    // Lấy tracking data để gán toạ độ chính xác cho đơn
    const tracking = await this.trackingRepo.findOne({ where: { ma_don_hang: maDonHang } });

    // Tạo ShipperDelivery record mới kèm toạ độ điểm lấy và điểm giao
    const delivery = this.deliveryRepo.create({
      ma_don_hang: maDonHang,
      shipper_id: shipperId,
      status: 'CONFIRMED',
      delivery_address: donHang.dia_chi_giao_hang,
      delivery_fee: 15000,
      delivery_latitude: tracking?.destination_latitude ? Number(tracking.destination_latitude) : null,
      delivery_longitude: tracking?.destination_longitude ? Number(tracking.destination_longitude) : null,
      pickup_latitude: tracking?.store_latitude ? Number(tracking.store_latitude) : branchInfo.latitude,
      pickup_longitude: tracking?.store_longitude ? Number(tracking.store_longitude) : branchInfo.longitude,
    });

    const saved = await this.deliveryRepo.save(delivery);

    // Đảm bảo đơn hàng ở trạng thái DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    // Tăng total_deliveries của shipper
    await this.shipperRepo.increment({ id: shipperId }, 'total_deliveries', 1);

    this.notificationGateway.phatSongDonHangChoShipper({
      action: 'ORDER_ACCEPTED',
      orderId: maDonHang,
      shipperId,
      branchCode: donHang.co_so_ma,
    });

    return {
      success: true,
      delivery: {
        ...saved,
        store_name: branchInfo.store_name,
        store_address: branchInfo.store_address,
        pickup_address: branchInfo.store_address,
        tracking: tracking ? {
          store_latitude: tracking.store_latitude || branchInfo.latitude,
          store_longitude: tracking.store_longitude || branchInfo.longitude,
          destination_latitude: tracking.destination_latitude,
          destination_longitude: tracking.destination_longitude,
        } : (branchInfo.latitude && branchInfo.longitude ? {
          store_latitude: branchInfo.latitude,
          store_longitude: branchInfo.longitude,
          destination_latitude: null,
          destination_longitude: null,
        } : null),
      },
      message: 'Nhận đơn thành công',
    };
  }

  // ============ DELIVERY MANAGEMENT ============

  async getAssignedDeliveries(shipperId: string, status?: string) {
    const query = this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.shipper_id = :shipperId', { shipperId });

    if (status) {
      query.andWhere('delivery.status = :status', { status });
    }

    query.orderBy('delivery.assigned_at', 'DESC');
    const deliveries = await query.getMany();
    
    if (deliveries.length === 0) return [];
    
    const orderIds = deliveries.map(d => d.ma_don_hang).filter(id => !!id);
    
    let orders2: any[] = [];
    let trackings: any[] = [];

    if (orderIds.length > 0) {
      try {
        orders2 = await this.donHangRepo.createQueryBuilder('don')
          .where('don.ma_don_hang IN (:...orderIds)', { orderIds })
          .getMany();
          
        trackings = await this.trackingRepo.createQueryBuilder('t')
          .where('t.ma_don_hang IN (:...orderIds)', { orderIds })
          .getMany();
      } catch (err) {
        console.error('Error fetching orders2 or trackings in getAssignedDeliveries:', err.message);
      }
    }

    const branches = await this.layDanhSachChiNhanh();

    return deliveries.map(d => {
      const o = orders2.find(x => x.ma_don_hang === d.ma_don_hang);
      const tracking = trackings.find(x => x.ma_don_hang === d.ma_don_hang);
      const branchInfo = this.resolveBranchInfoSync(o?.co_so_ma, branches);
      const storeLat = tracking?.store_latitude || d.pickup_latitude || branchInfo.latitude;
      const storeLng = tracking?.store_longitude || d.pickup_longitude || branchInfo.longitude;

      return {
        ...d,
        cod_amount: o?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(o.tong_tien || 0) : 0,
        order_value: Number(o?.tong_tien || 0),
        co_so_ma: o?.co_so_ma,
        pickup_address: branchInfo.store_address,
        store_name: branchInfo.store_name,
        store_address: branchInfo.store_address,
        pickup_latitude: storeLat,
        pickup_longitude: storeLng,
        tracking: tracking ? {
          store_latitude: storeLat,
          store_longitude: storeLng,
          destination_latitude: tracking.destination_latitude,
          destination_longitude: tracking.destination_longitude
        } : (storeLat && storeLng ? {
          store_latitude: storeLat,
          store_longitude: storeLng,
          destination_latitude: d.delivery_latitude,
          destination_longitude: d.delivery_longitude
        } : null)
      };
    });
  }

  async getDeliveryDetail(deliveryId: string) {
    // Support cả delivery ID lẫn ma_don_hang
    let delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });

    if (!delivery) {
      // Thử tìm theo ma_don_hang
      delivery = await this.deliveryRepo.findOne({
        where: { ma_don_hang: deliveryId },
      });
    }

    if (!delivery) throw new NotFoundException('Delivery not found');

    const shipper = delivery.shipper_id ? await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } }) : null;
    delivery.shipper = shipper;

    // Đính kèm thông tin đơn hàng đầy đủ
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: delivery.ma_don_hang },
      relations: ['chi_tiet'],
    });

    const cod_amount = donHang?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(donHang.tong_tien || 0) : 0;
    const order_value = Number(donHang?.tong_tien || 0);

    const tracking = await this.trackingRepo.findOne({ where: { ma_don_hang: delivery.ma_don_hang } });
    const branchInfo = await this.getBranchInfo(donHang?.co_so_ma);

    const destLat = tracking?.destination_latitude ? Number(tracking.destination_latitude) : (delivery.delivery_latitude ? Number(delivery.delivery_latitude) : null);
    const destLng = tracking?.destination_longitude ? Number(tracking.destination_longitude) : (delivery.delivery_longitude ? Number(delivery.delivery_longitude) : null);
    const storeLat = tracking?.store_latitude ? Number(tracking.store_latitude) : (delivery.pickup_latitude ? Number(delivery.pickup_latitude) : branchInfo.latitude);
    const storeLng = tracking?.store_longitude ? Number(tracking.store_longitude) : (delivery.pickup_longitude ? Number(delivery.pickup_longitude) : branchInfo.longitude);

    return { 
      ...delivery, 
      delivery_latitude: destLat,
      delivery_longitude: destLng,
      pickup_latitude: storeLat,
      pickup_longitude: storeLng,
      pickup_address: branchInfo.store_address,
      store_name: branchInfo.store_name,
      store_address: branchInfo.store_address,
      order: donHang, 
      cod_amount, 
      order_value,
      tracking: tracking ? {
        store_latitude: storeLat,
        store_longitude: storeLng,
        destination_latitude: destLat,
        destination_longitude: destLng
      } : (storeLat && storeLng ? {
        store_latitude: storeLat,
        store_longitude: storeLng,
        destination_latitude: destLat,
        destination_longitude: destLng
      } : null)
    };
  }

  async confirmPickup(deliveryId: string, shipperId: string) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update({ id: deliveryId }, { status: 'PICKING_UP', picked_up_at: new Date() });
    return { success: true, message: 'Pickup confirmed' };
  }

  async startDelivery(deliveryId: string, shipperId: string, latitude: number, longitude: number) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      { status: 'IN_TRANSIT', pickup_latitude: latitude, pickup_longitude: longitude },
    );
    return { success: true, message: 'Delivery started' };
  }

  async completeDelivery(deliveryId: string, shipperId: string, latitude: number, longitude: number, proofImageUrl?: string, isBatched?: boolean) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      {
        status: 'DELIVERED',
        delivered_at: new Date(),
        delivery_latitude: latitude,
        delivery_longitude: longitude,
        proof_image_url: proofImageUrl || null,
        delivery_note: isBatched ? '[BATCHED] Giao ghép tuyến AI' : delivery.delivery_note,
      },
    );

    // Cập nhật đơn hàng → HOAN_THANH
    let cod_amount = 0;
    let branch_code = 'MAC_DINH_CHI';
    if (delivery.ma_don_hang) {
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: delivery.ma_don_hang } });
      if (donHang) {
        branch_code = donHang.co_so_ma || 'MAC_DINH_CHI';
        if (donHang.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
          cod_amount = Number(donHang.tong_tien || 0);
        }
        
        const lichSu = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
        lichSu.push({
          loai: 'ORDER',
          trang_thai: 'HOAN_THANH',
          thoi_gian: new Date().toISOString(),
        });
        if (donHang.trang_thai_thanh_toan !== 'DA_THANH_TOAN') {
          lichSu.push({
            loai: 'PAYMENT',
            trang_thai: 'DA_THANH_TOAN',
            thoi_gian: new Date().toISOString(),
          });
        }
        
        await this.donHangRepo.update(
          { ma_don_hang: delivery.ma_don_hang },
          { 
            trang_thai_don_hang: 'HOAN_THANH', 
            trang_thai_thanh_toan: 'DA_THANH_TOAN',
            lich_su_trang_thai: lichSu
          },
        );
      }
    }

    // Cập nhật Ví tài xế (ShipperWallet)
    let wallet = await this.walletRepo.findOne({ where: { shipper_id: shipperId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ shipper_id: shipperId, balance: 0, cod_holding: 0, pending_commission: 0, cod_details: {} });
    }
    
    // Hardcode phí giao hàng = 15,000 VND
    const delivery_fee = 15000;
    
    wallet.balance = Number(wallet.balance) + delivery_fee;
    if (cod_amount > 0) {
      wallet.cod_holding = Number(wallet.cod_holding) + cod_amount;
      
      const currentDetails = typeof wallet.cod_details === 'object' && wallet.cod_details !== null ? { ...wallet.cod_details } : {};
      const currentBranchCod = Number(currentDetails[branch_code] || 0);
      currentDetails[branch_code] = currentBranchCod + cod_amount;
      wallet.cod_details = currentDetails;
    }
    await this.walletRepo.save(wallet);

    return { success: true, message: 'Delivery completed' };
  }

  async failDelivery(deliveryId: string, shipperId: string, reason: string) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update({ id: deliveryId }, { status: 'FAILED', delivery_note: reason });
    return { success: true, message: 'Delivery marked as failed' };
  }

  async getDeliveryStats(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');

    const [totalDeliveries, completedToday, pendingDeliveries, failedDeliveries] = await Promise.all([
      this.deliveryRepo.count({ where: { shipper_id: shipperId } }),
      this.deliveryRepo
        .createQueryBuilder('delivery')
        .where('delivery.shipper_id = :shipperId', { shipperId })
        .andWhere('delivery.status = :status', { status: 'DELIVERED' })
        .andWhere('CAST(delivery.delivered_at as DATE) = CAST(NOW() as DATE)')
        .getCount(),
      this.deliveryRepo.count({ where: { shipper_id: shipperId, status: 'PENDING' } }),
      this.deliveryRepo.count({ where: { shipper_id: shipperId, status: 'FAILED' } }),
    ]);

    return {
      total_deliveries: totalDeliveries,
      completed_today: completedToday,
      pending_deliveries: pendingDeliveries,
      failed_deliveries: failedDeliveries,
      rating: shipper.rating,
    };
  }

  async getNearbyDeliveries(shipperId: string, radiusKm: number = 5) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    if (!shipper.current_latitude || !shipper.current_longitude) {
      // Trả về available orders của cơ sở shipper thay vì throw
      return this.getAvailableOrders(shipper.branch_code || undefined, shipperId);
    }

    const deliveries = await this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.status = :status', { status: 'IN_TRANSIT' })
      .andWhere('delivery.delivery_latitude IS NOT NULL')
      .andWhere('delivery.delivery_longitude IS NOT NULL')
      .getMany();

    return deliveries.filter((d) => {
      const distance = this.calculateDistance(
        shipper.current_latitude!,
        shipper.current_longitude!,
        Number(d.delivery_latitude || 0),
        Number(d.delivery_longitude || 0),
      );
      return distance <= radiusKm;
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ============ WALLET, SCHEDULE, EXCEPTIONS ============

  async getWallet(shipperId: string) {
    let wallet = await this.walletRepo.findOne({ where: { shipper_id: shipperId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ shipper_id: shipperId, balance: 0, cod_holding: 0, pending_commission: 0 });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async getSchedule(shipperId: string) {
    return this.scheduleRepo.find({ where: { shipper_id: shipperId }, order: { work_date: 'DESC' } });
  }

  async reportException(
    shipperId: string,
    deliveryId: string,
    type: 'CUSTOMER_UNREACHABLE' | 'WRONG_ADDRESS' | 'ITEM_DAMAGED' | 'VEHICLE_ISSUE' | 'OTHER',
    description: string,
    imageUrl?: string,
  ) {
    const exception = this.exceptionRepo.create({
      shipper_id: shipperId,
      delivery_id: deliveryId,
      exception_type: type,
      description,
      image_url: imageUrl || null,
      status: 'PENDING',
    });
    return this.exceptionRepo.save(exception);
  }

  async getVehicle(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    return { vehicle_type: shipper.vehicle_type, vehicle_plate: shipper.vehicle_plate };
  }

  async updateVehicle(shipperId: string, vehicleType: string, vehiclePlate: string) {
    await this.shipperRepo.update({ id: shipperId }, { vehicle_type: vehicleType, vehicle_plate: vehiclePlate });
    return { success: true, message: 'Vehicle updated' };
  }

  async getNotifications(shipperId: string) {
    // Check pending available orders for this shipper's branch
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    const availableCount = shipper ? (await this.getAvailableOrders(shipper.branch_code || undefined, shipperId)).length : 0;

    const notifications: Array<{ id: string; title: string; content: string; created_at: Date; type: string }> = [];

    if (availableCount > 0) {
      notifications.push({
        id: 'avail-orders',
        title: `🚀 ${availableCount} đơn hàng đang chờ`,
        content: `Có ${availableCount} đơn DANG_GIAO chưa có Shipper. Vào trang chủ để nhận ngay!`,
        created_at: new Date(),
        type: 'ORDER',
      });
    }

    notifications.push(
      { id: '2', title: '💡 Mẹo giao hàng', content: 'Giữ điện thoại đủ pin để GPS hoạt động chính xác.', created_at: new Date(Date.now() - 3600000), type: 'TIP' },
    );

    return notifications;
  }

  // ============ MANAGER & ADMIN: List all shippers + management ============

  async getAllShippers(branchCode?: string, status?: string, searchKeyword?: string) {
    const query = this.shipperRepo.createQueryBuilder('s');
    if (branchCode) {
      const normalized = branchCode.toUpperCase().replace(/-/g, '_');
      query.andWhere('UPPER(REPLACE(s.branch_code, \'-\', \'_\')) = :branchCode', { branchCode: normalized });
    }
    if (status) {
      query.andWhere('s.status = :status', { status });
    }
    if (searchKeyword) {
      query.andWhere('(s.full_name ILIKE :q OR s.username ILIKE :q OR s.phone ILIKE :q)', { q: `%${searchKeyword}%` });
    }
    return query.orderBy('s.status', 'ASC').getMany();
  }

  async createShipper(data: any) {
    const existing = await this.shipperRepo.findOne({ where: { username: data.username } });
    if (existing) throw new BadRequestException('Tên đăng nhập (username) đã tồn tại');

    const shipper = this.shipperRepo.create({
      username: data.username,
      full_name: data.full_name,
      phone: data.phone || data.phone_number || '0900000000',
      email: data.email || null,
      branch_code: data.branch_code || 'MAC_DINH_CHI',
      status: data.status || 'ACTIVE',
      vehicle_type: data.vehicle_type || 'MOTORBIKE',
      vehicle_plate: data.vehicle_plate || '59X1-12345',
    });
    return this.shipperRepo.save(shipper);
  }

  async updateShipperInfo(id: string, data: any) {
    const shipper = await this.shipperRepo.findOne({ where: { id } });
    if (!shipper) throw new NotFoundException('Shipper không tồn tại');

    if (data.username && data.username !== shipper.username) {
      const existing = await this.shipperRepo.findOne({ where: { username: data.username } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('Tên đăng nhập (username) đã tồn tại');
      }
      shipper.username = data.username;
    }
    if (data.full_name) shipper.full_name = data.full_name;
    if (data.phone !== undefined || data.phone_number !== undefined) {
      shipper.phone = data.phone || data.phone_number || '';
    }
    if (data.email !== undefined) shipper.email = data.email;
    if (data.branch_code !== undefined) shipper.branch_code = data.branch_code;
    if (data.status) shipper.status = data.status;
    if (data.vehicle_type) shipper.vehicle_type = data.vehicle_type;
    if (data.vehicle_plate) shipper.vehicle_plate = data.vehicle_plate;
    if (data.password) shipper.password = String(data.password).trim();

    return this.shipperRepo.save(shipper);
  }

  async resetAccount(id: string, newPassword?: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id } });
    if (!shipper) throw new NotFoundException('Tài xế không tồn tại');

    const defaultPass = String(newPassword || '123456').trim();
    shipper.password = defaultPass;
    shipper.status = 'ACTIVE';
    await this.shipperRepo.save(shipper);

    // Xóa cache nhóm đơn kẹt trong Redis để reset sạch phiên giao dịch
    try {
      await this.redisCacheService.delete(`shipper:batch:${id}`);
      await this.redisCacheService.delete(`shipper:active:${id}`);
    } catch (err: any) {
      console.warn('[resetAccount] Failed to clear redis cache:', err?.message || err);
    }

    return {
      success: true,
      message: `Đã reset tài khoản tài xế @${shipper.username} thành công. Mật khẩu mặc định là: ${defaultPass}`,
      default_password: defaultPass,
      shipper,
    };
  }

  async deleteShipper(id: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id } });
    if (!shipper) throw new NotFoundException('Shipper không tồn tại');
    try {
      await this.shipperRepo.remove(shipper);
    } catch {
      shipper.status = 'INACTIVE';
      await this.shipperRepo.save(shipper);
    }
    return { success: true, message: 'Đã xóa shipper thành công' };
  }

  async getExceptions(status?: string, limit: number = 50) {
    const query = this.exceptionRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.shipper', 'shipper')
      .leftJoinAndSelect('e.delivery', 'delivery');
    if (status) {
      query.where('e.status = :status', { status });
    }
    return query.orderBy('e.created_at', 'DESC').take(limit).getMany();
  }

  async handleExceptionAction(id: string, action: string, note?: string) {
    const exc = await this.exceptionRepo.findOne({ where: { id } });
    if (!exc) throw new NotFoundException('Báo cáo ngoại lệ không tồn tại');
    exc.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    return this.exceptionRepo.save(exc);
  }

  async getDispatchConfig() {
    return {
      auto_dispatch: true,
      max_orders_per_shipper: 3,
      search_radius_km: 5,
      commission_rate_percent: 15,
    };
  }

  async updateDispatchConfig(config: any) {
    return {
      success: true,
      message: 'Cập nhật cấu hình thành công',
      config,
    };
  }

  async setCommissionRate(ratePercent: number) {
    return {
      success: true,
      message: `Đã cập nhật tỷ lệ hoa hồng: ${ratePercent}%`,
      commission_rate_percent: ratePercent,
    };
  }

  async getKpiData(range: string = 'week') {
    const shippers = await this.shipperRepo.find();
    return {
      total_deliveries: shippers.reduce((acc, s) => acc + (s.total_deliveries || 0), 0),
      avg_rating: 4.8,
      on_time_rate: 96.5,
      top_shippers: shippers.slice(0, 5).map(s => ({
        id: s.id,
        name: s.full_name,
        completed_orders: s.total_deliveries,
        rating: s.rating,
      })),
    };
  }

  async getFinanceData(limit: number = 20) {
    const shippers = await this.shipperRepo.find({ take: limit });
    return {
      total_commission_payout: 15400000,
      total_shipping_fee_collected: 35000000,
      shippers_finance: shippers.map(s => ({
        id: s.id,
        full_name: s.full_name,
        phone: s.phone,
        total_deliveries: s.total_deliveries,
        balance: 150000,
        commission_earned: (s.total_deliveries || 0) * 15000 * 0.85,
      })),
    };
  }

  async assignOrderToShipper(maDonHang: string, shipperId: string, managerId: string) {
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang },
      relations: ['chi_tiet'],
    });

    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');
    if (!['DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'].includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Không thể phân công đơn ở trạng thái ${donHang.trang_thai_don_hang}`);
    }

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new NotFoundException('Shipper không tồn tại');

    // Chặn nếu nhân viên gán đơn khác chi nhánh của shipper
    if (shipper.branch_code && donHang.co_so_ma) {
      const branches = await this.layDanhSachChiNhanh();
      const isMatch = this.checkBranchMatch(shipper.branch_code, donHang.co_so_ma, branches);
      if (!isMatch) {
        throw new BadRequestException(`Tài xế ${shipper.full_name} thuộc cơ sở ${shipper.branch_code}, không thể phân công đơn của cơ sở ${donHang.co_so_ma}.`);
      }
    }

    // Hủy delivery record cũ nếu có
    await this.deliveryRepo.update({ ma_don_hang: maDonHang }, { status: 'CANCELLED' });

    // Lấy tracking data để gán toạ độ
    const tracking = await this.trackingRepo.findOne({ where: { ma_don_hang: maDonHang } });

    // Tạo delivery record mới
    const delivery = this.deliveryRepo.create({
      ma_don_hang: maDonHang,
      shipper_id: shipperId,
      status: 'CONFIRMED',
      delivery_address: donHang.dia_chi_giao_hang,
      delivery_fee: 15000,
      delivery_latitude: tracking?.destination_latitude ? Number(tracking.destination_latitude) : null,
      delivery_longitude: tracking?.destination_longitude ? Number(tracking.destination_longitude) : null,
      pickup_latitude: tracking?.store_latitude ? Number(tracking.store_latitude) : null,
      pickup_longitude: tracking?.store_longitude ? Number(tracking.store_longitude) : null,
    });
    const saved = await this.deliveryRepo.save(delivery);

    // Cập nhật trạng thái đơn → DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    return { success: true, delivery: saved, message: `Đã phân công đơn ${maDonHang} cho Shipper ${shipper.full_name}` };
  }

  // ============ STAFF: Chuyển đơn sang DANG_GIAO cho Shipper nội bộ nhận ============

  /**
   * Được gọi khi Staff bấm "Shipper Nội Bộ": 
   * Chuyển đơn sang DANG_GIAO để xuất hiện trong pool của Shipper.
   */
  async markOrderReadyForDelivery(maDonHang: string) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');

    const allowedStatuses = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO'];
    if (!allowedStatuses.includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Không thể chuyển đơn ở trạng thái ${donHang.trang_thai_don_hang} sang DANG_GIAO`);
    }

    // Hủy delivery record cũ bị stuck (không phải DELIVERED) để đơn xuất hiện lại trong pool
    await this.deliveryRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'CANCELLED' })
      .where('ma_don_hang = :maDonHang', { maDonHang })
      .andWhere('status IN (:...cancelStatuses)', { cancelStatuses: ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'] })
      .execute();

    // Chuyển đơn sang DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    return { success: true, message: `Đơn ${maDonHang} đã chuyển sang DANG_GIAO, Shipper có thể nhận ngay` };
  }

  // ============ CUSTOMER: Tracking + Rating ============

  /**
   * GET /customers/orders/:orderId/delivery
   * Trả về thông tin shipper đang giao, vị trí GPS, ETA cho khách hàng.
   */
  async getCustomerDeliveryInfo(orderId: string) {
    // Tìm delivery record active cho đơn này
    const delivery = await this.deliveryRepo.findOne({
      where: { ma_don_hang: orderId },
    });

    if (!delivery || ['FAILED', 'CANCELLED'].includes(delivery.status)) {
      return { has_shipper: false, message: 'Chưa có shipper nhận đơn này' };
    }

    // Lấy thông tin shipper
    const shipper = await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } });

    // Tính ETA đơn giản dựa trên trạng thái
    let estimated_delivery: string | null = null;
    if (delivery.status === 'IN_TRANSIT') {
      const etaTime = new Date(Date.now() + 20 * 60 * 1000); // +20 phút
      estimated_delivery = etaTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } else if (delivery.status === 'PICKING_UP') {
      const etaTime = new Date(Date.now() + 35 * 60 * 1000); // +35 phút
      estimated_delivery = etaTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    return {
      has_shipper: true,
      delivery_id: delivery.id,
      delivery_status: delivery.status,
      shipper_name: shipper?.full_name || 'Shipper Avengers',
      shipper_phone: shipper?.phone || null,
      shipper_rating: shipper?.rating || 4.5,
      shipper_vehicle: shipper?.vehicle_type || 'MOTORBIKE',
      shipper_vehicle_plate: shipper?.vehicle_plate || null,
      // Vị trí GPS của shipper (cập nhật real-time)
      shipper_latitude: shipper?.current_latitude ? Number(shipper.current_latitude) : null,
      shipper_longitude: shipper?.current_longitude ? Number(shipper.current_longitude) : null,
      estimated_delivery,
      picked_up_at: delivery.picked_up_at,
      delivered_at: delivery.delivered_at,
    };
  }

  /**
   * POST /customers/:userId/orders/:orderId/rate-shipper
   * Khách hàng đánh giá shipper sau khi giao hàng thành công.
   */
  async rateShipper(orderId: string, rating: number, comment?: string) {
    // Tìm delivery của đơn này
    const delivery = await this.deliveryRepo.findOne({ where: { ma_don_hang: orderId, status: 'DELIVERED' } });
    if (!delivery) throw new BadRequestException('Không tìm thấy đơn đã giao hoặc đơn chưa được giao thành công');

    const safeRating = Math.min(5, Math.max(1, Math.round(rating)));

    // Cập nhật rating của shipper (trung bình luỹ tiến đơn giản)
    const shipper = await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } });
    if (shipper) {
      const newRating = Math.round(((Number(shipper.rating) * 0.8) + (safeRating * 0.2)) * 100) / 100;
      await this.shipperRepo.update({ id: shipper.id }, { rating: Math.min(5, newRating) });
    }

    // Lưu đánh giá vào delivery note, dù có comment hay không
    const newNote = `[Đánh giá ${safeRating}⭐] ${comment?.trim() || ''}`.trim();
    await this.deliveryRepo.update({ id: delivery.id }, { delivery_note: newNote });

    return { success: true, message: 'Cảm ơn bạn đã đánh giá!', rating: safeRating };
  }

  // ============ BATCH ORDERS: Gom đơn cùng khu vực ============

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * GET /shippers/:shipperId/batch-orders
   * Gom đơn DANG_GIAO cùng co_so_ma thành batch, kèm tracking data.
   */
  async getBatchOrders(shipperId: string) {
    const branches = await this.layDanhSachChiNhanh();
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper || !shipper.branch_code) return [];

    // Lấy tất cả đơn available (chưa có shipper active)
    const activeDeliveries = await this.deliveryRepo
      .createQueryBuilder('d')
      .select(['d.ma_don_hang'])
      .where('d.status IN (:...activeStatuses)', { activeStatuses: ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'] })
      .getMany();
    const activeOrderIds = activeDeliveries.map(d => d.ma_don_hang).filter(id => !!id);

    let query = this.donHangRepo
      .createQueryBuilder('don')
      .leftJoinAndSelect('don.chi_tiet', 'chi_tiet')
      .where('don.trang_thai_don_hang = :status', { status: 'DANG_GIAO' });

    if (activeOrderIds.length > 0) {
      query = query.andWhere('don.ma_don_hang NOT IN (:...activeIds)', { activeIds: activeOrderIds });
    }

    // Chỉ lấy đơn hàng thuộc chi nhánh của shipper
    const possibleCodes = this.getPossibleBranchCodes(shipper.branch_code, branches);
    query = query.andWhere(
      "(UPPER(REPLACE(don.co_so_ma, '-', '_')) IN (:...possibleCodes) OR UPPER(don.co_so_ma) IN (:...possibleCodes))",
      { possibleCodes },
    );

    query = query.orderBy('don.ngay_tao', 'DESC');
    const orders = await query.getMany();
    const matchedOrders = orders.filter((o) => this.checkBranchMatch(shipper.branch_code, o.co_so_ma, branches));

    if (matchedOrders.length === 0) return [];

    // Lấy tracking data
    const orderIds = orders.map(o => o.ma_don_hang);
    const trackings = await this.trackingRepo.createQueryBuilder('t')
      .where('t.ma_don_hang IN (:...orderIds)', { orderIds })
      .getMany();
    const trackingMap = new Map(trackings.map(t => [t.ma_don_hang, t]));

    // Gom theo co_so_ma (branch)
    const groups = new Map<string, typeof orders>();
    for (const order of orders) {
      const key = order.co_so_ma || 'UNKNOWN';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }

    // Chỉ tạo batch khi có >= 2 đơn cùng branch
    const batches: any[] = [];
    let batchIdx = 0;
    for (const [branchCode, branchOrders] of groups) {
      if (branchOrders.length < 2) continue;

      const deliveries = branchOrders.map(o => {
        const tr = trackingMap.get(o.ma_don_hang);
        return {
          id: o.ma_don_hang,
          ma_don_hang: o.ma_don_hang,
          delivery_address: o.dia_chi_giao_hang,
          delivery_fee: 15000,
          delivery_latitude: tr?.destination_latitude ? Number(tr.destination_latitude) : null,
          delivery_longitude: tr?.destination_longitude ? Number(tr.destination_longitude) : null,
          store_latitude: tr?.store_latitude ? Number(tr.store_latitude) : null,
          store_longitude: tr?.store_longitude ? Number(tr.store_longitude) : null,
          tracking: tr ? {
            store_latitude: tr.store_latitude,
            store_longitude: tr.store_longitude,
            destination_latitude: tr.destination_latitude,
            destination_longitude: tr.destination_longitude,
          } : null,
          order_value: Number(o.tong_tien || 0),
          cod_amount: o.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(o.tong_tien || 0) : 0,
          items: (o.chi_tiet || []).map(item => ({
            ten_san_pham: item.ten_san_pham,
            so_luong: item.so_luong,
          })),
        };
      });

      // Tính total distance ước tính
      let totalDist = 0;
      for (let i = 0; i < deliveries.length - 1; i++) {
        const d1 = deliveries[i];
        const d2 = deliveries[i + 1];
        if (d1.delivery_latitude && d1.delivery_longitude && d2.delivery_latitude && d2.delivery_longitude) {
          totalDist += this.haversineKm(
            Number(d1.delivery_latitude), Number(d1.delivery_longitude),
            Number(d2.delivery_latitude), Number(d2.delivery_longitude),
          );
        }
      }

      batches.push({
        id: `batch-${branchCode}-${Date.now()}-${batchIdx}`,
        zone_label: `Khu vực ${branchCode.replace(/_/g, ' ')}`,
        branch_code: branchCode,
        total_distance_km: Math.round(totalDist * 10) / 10,
        deliveries,
      });
      batchIdx++;
    }

    return batches;
  }

  /**
   * POST /shippers/:shipperId/batch-orders/:batchId/accept
   * Nhận batch đơn: accept tất cả đơn trong batch.
   */
  /**
   * POST /shippers/:shipperId/cod-remit
   * Shipper xác nhận đã nộp tiền COD cho cửa hàng, tạo bản ghi chờ xác nhận
   */
  async submitCodRemit(shipperId: string, amount: number, branchCode?: string, note?: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new NotFoundException('Shipper not found');

    const effectiveBranchCode = (branchCode || shipper.branch_code || 'MAC_DINH_CHI').trim();

    const wallet = await this.walletRepo.findOne({ where: { shipper_id: shipperId } });
    if (!wallet) throw new BadRequestException('Ví không tồn tại');

    const currentDetails = typeof wallet.cod_details === 'object' && wallet.cod_details !== null ? wallet.cod_details : {};
    let actualCodHoldingForBranch = Number(currentDetails[effectiveBranchCode] || 0);

    // Tính tổng COD đã được tracking
    const trackedCodSum = Object.values(currentDetails).reduce((sum, val) => sum + Number(val || 0), 0);
    const untrackedLegacyCod = Math.max(0, Number(wallet.cod_holding) - Number(trackedCodSum));

    // Nếu tiền nộp vượt quá mức branch đang giữ, nhưng vẫn nằm trong khoản tiền cũ chưa tracking
    if (amount > actualCodHoldingForBranch && amount <= actualCodHoldingForBranch + untrackedLegacyCod) {
      actualCodHoldingForBranch += untrackedLegacyCod;
    }

    if (actualCodHoldingForBranch <= 0) {
      throw new BadRequestException('Không có tiền COD nào của cơ sở này đang giữ để nộp.');
    }

    if (amount > actualCodHoldingForBranch) {
      throw new BadRequestException(`Số tiền nộp (${amount}) vượt quá số COD đang giữ của cơ sở này (${actualCodHoldingForBranch}).`);
    }

    const remit = this.codRemitRepo.create({
      shipper_id: shipperId,
      shipper_name: shipper.full_name,
      branch_code: branchCode,
      amount: amount,
      status: 'PENDING',
      note: note || null,
    } as any);
    await this.codRemitRepo.save(remit);

    // Trừ tiền ngay lập tức khỏi ví shipper để UI không hiển thị nữa (tránh shipper bấm nộp 2 lần)
    wallet.cod_holding = Math.max(0, Number(wallet.cod_holding) - amount);
    if (branchCode && branchCode !== 'LEGACY_COD' && typeof wallet.cod_details === 'object' && wallet.cod_details !== null) {
      const currentDetails = { ...wallet.cod_details } as Record<string, number>;
      const currentBranchCod = Number(currentDetails[branchCode] || 0);
      currentDetails[branchCode] = Math.max(0, currentBranchCod - amount);
      wallet.cod_details = currentDetails;
    }
    await this.walletRepo.save(wallet);

    return { success: true, remit, message: `Đã gửi yêu cầu nộp ${amount.toLocaleString('vi-VN')}đ — đang chờ quản lý xác nhận.` };
  }

  async acceptBatchOrders(shipperId: string, orderIds: string[]) {
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 đơn hàng để ghép đơn.');
    }

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new NotFoundException('Tài xế không tồn tại.');

    const branches = await this.layDanhSachChiNhanh();
    const acceptedDeliveries: any[] = [];
    let commonBranchInfo: any = null;

    for (const orderId of orderIds) {
      try {
        const donHang = await this.donHangRepo.findOne({
          where: { ma_don_hang: orderId },
          relations: ['chi_tiet'],
        });
        if (!donHang) continue;

        if (!commonBranchInfo) {
          const bCode = (donHang.co_so_ma || shipper.branch_code) || undefined;
          commonBranchInfo = await this.getBranchInfo(bCode);
        }

        let delivery = await this.deliveryRepo.findOne({
          where: { ma_don_hang: orderId },
        });

        const tracking = await this.trackingRepo.findOne({ where: { ma_don_hang: orderId } });

        if (delivery) {
          delivery.status = 'CONFIRMED';
          delivery.shipper_id = shipperId;
          delivery.is_batched = true;
          if (!delivery.delivery_latitude && tracking?.destination_latitude) {
            delivery.delivery_latitude = Number(tracking.destination_latitude);
          }
          if (!delivery.delivery_longitude && tracking?.destination_longitude) {
            delivery.delivery_longitude = Number(tracking.destination_longitude);
          }
          if (!delivery.pickup_latitude) {
            delivery.pickup_latitude = tracking?.store_latitude ? Number(tracking.store_latitude) : commonBranchInfo?.latitude;
          }
          if (!delivery.pickup_longitude) {
            delivery.pickup_longitude = tracking?.store_longitude ? Number(tracking.store_longitude) : commonBranchInfo?.longitude;
          }
          await this.deliveryRepo.save(delivery);
        } else {
          delivery = this.deliveryRepo.create({
            ma_don_hang: orderId,
            shipper_id: shipperId,
            status: 'CONFIRMED',
            delivery_address: donHang.dia_chi_giao_hang,
            delivery_fee: 15000,
            is_batched: true,
            delivery_latitude: tracking?.destination_latitude ? Number(tracking.destination_latitude) : null,
            delivery_longitude: tracking?.destination_longitude ? Number(tracking.destination_longitude) : null,
            pickup_latitude: tracking?.store_latitude ? Number(tracking.store_latitude) : commonBranchInfo?.latitude,
            pickup_longitude: tracking?.store_longitude ? Number(tracking.store_longitude) : commonBranchInfo?.longitude,
          });
          await this.deliveryRepo.save(delivery);
          await this.shipperRepo.increment({ id: shipperId }, 'total_deliveries', 1);
        }

        if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
          await this.donHangRepo.update({ ma_don_hang: orderId }, { trang_thai_don_hang: 'DANG_GIAO' });
        }

        acceptedDeliveries.push({
          id: delivery.id,
          ma_don_hang: donHang.ma_don_hang,
          status: delivery.status,
          delivery_address: donHang.dia_chi_giao_hang,
          delivery_fee: Number(delivery.delivery_fee || 15000),
          delivery_latitude: delivery.delivery_latitude,
          delivery_longitude: delivery.delivery_longitude,
          pickup_latitude: delivery.pickup_latitude,
          pickup_longitude: delivery.pickup_longitude,
          customer_name: donHang.ten_khach_hang || 'Khách hàng',
          customer_phone: donHang.guest_phone || '',
          order_value: Number(donHang.tong_tien || 0),
          cod_amount: donHang.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(donHang.tong_tien || 0) : 0,
          tracking: tracking ? {
            store_latitude: tracking.store_latitude,
            store_longitude: tracking.store_longitude,
            destination_latitude: tracking.destination_latitude,
            destination_longitude: tracking.destination_longitude,
          } : null,
          items: (donHang.chi_tiet || []).map(i => ({ ten_san_pham: i.ten_san_pham, so_luong: i.so_luong })),
        });
      } catch (err: any) {
        console.warn(`[acceptBatchOrders] Lỗi khi gán đơn ${orderId}:`, err?.message || err);
      }
    }

    if (acceptedDeliveries.length === 0) {
      throw new BadRequestException('Không thể nhận đơn hàng nào trong danh sách đã chọn.');
    }

    const batchId = `batch-${Date.now()}`;
    const totalCod = acceptedDeliveries.reduce((sum, d) => sum + (d.cod_amount || 0), 0);
    const totalFee = acceptedDeliveries.reduce((sum, d) => sum + (d.delivery_fee || 15000), 0);

    const batch = {
      id: batchId,
      batch_code: batchId.toUpperCase(),
      shipper_id: shipperId,
      branch_code: shipper.branch_code,
      store_name: commonBranchInfo?.store_name || 'Avengers Coffee',
      store_address: commonBranchInfo?.store_address || 'Cửa hàng Avengers Coffee',
      store_latitude: commonBranchInfo?.latitude || 10.7834,
      store_longitude: commonBranchInfo?.longitude || 106.6802,
      total_orders: acceptedDeliveries.length,
      total_cod: totalCod,
      total_fee: totalFee,
      status: 'IN_PROGRESS',
      created_at: new Date().toISOString(),
      deliveries: acceptedDeliveries,
    };

    if (this.redisCacheService) {
      await this.redisCacheService.setJson(`shipper:batch:${shipperId}`, batch, 86400).catch(() => {});
    }

    this.notificationGateway.phatSongDonHangChoShipper({
      action: 'BATCH_CREATED',
      orderIds,
      shipperId,
      branchCode: batch.branch_code,
    });

    return {
      success: true,
      message: `Đã ghép thành công ${acceptedDeliveries.length} đơn hàng`,
      batch,
    };
  }

  async getActiveBatch(shipperId: string) {
    if (this.redisCacheService) {
      const cached = await this.redisCacheService.getJson<any>(`shipper:batch:${shipperId}`).catch(() => null);
      if (cached && cached.deliveries && cached.deliveries.length > 0) {
        const activeCount = await this.deliveryRepo.count({
          where: {
            shipper_id: shipperId,
            is_batched: true,
            status: 'CONFIRMED',
          },
        });
        if (activeCount > 0) {
          return { active: true, batch: cached };
        }
      }
    }

    const batchedDeliveries = await this.deliveryRepo.find({
      where: {
        shipper_id: shipperId,
        is_batched: true,
      },
    });

    const activeDeliveries = batchedDeliveries.filter(d => ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'].includes(d.status));
    if (activeDeliveries.length === 0) {
      return { active: false, batch: null };
    }

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    const orderIds = activeDeliveries.map(d => d.ma_don_hang);
    const donHangs = await this.donHangRepo.find({
      where: orderIds.map(id => ({ ma_don_hang: id })),
      relations: ['chi_tiet'],
    });
    const donHangMap = new Map(donHangs.map(o => [o.ma_don_hang, o]));

    const trackings = await this.trackingRepo.find({
      where: orderIds.map(id => ({ ma_don_hang: id })),
    });
    const trackingMap = new Map(trackings.map(t => [t.ma_don_hang, t]));

    const activeBranchCode = (shipper?.branch_code || donHangs[0]?.co_so_ma) || undefined;
    const branchInfo = await this.getBranchInfo(activeBranchCode);

    const enrichedDeliveries = activeDeliveries.map(d => {
      const order = donHangMap.get(d.ma_don_hang);
      const tracking = trackingMap.get(d.ma_don_hang);
      return {
        id: d.id,
        ma_don_hang: d.ma_don_hang,
        status: d.status,
        delivery_address: d.delivery_address || order?.dia_chi_giao_hang,
        delivery_fee: Number(d.delivery_fee || 15000),
        delivery_latitude: d.delivery_latitude || (tracking?.destination_latitude ? Number(tracking.destination_latitude) : null),
        delivery_longitude: d.delivery_longitude || (tracking?.destination_longitude ? Number(tracking.destination_longitude) : null),
        pickup_latitude: d.pickup_latitude || branchInfo.latitude,
        pickup_longitude: d.pickup_longitude || branchInfo.longitude,
        customer_name: order?.ten_khach_hang || 'Khách hàng',
        customer_phone: order?.guest_phone || '',
        order_value: Number(order?.tong_tien || 0),
        cod_amount: order?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(order?.tong_tien || 0) : 0,
        tracking: tracking ? {
          store_latitude: tracking.store_latitude,
          store_longitude: tracking.store_longitude,
          destination_latitude: tracking.destination_latitude,
          destination_longitude: tracking.destination_longitude,
        } : null,
        items: (order?.chi_tiet || []).map(i => ({ ten_san_pham: i.ten_san_pham, so_luong: i.so_luong })),
      };
    });

    const batch = {
      id: `batch-${Date.now()}`,
      batch_code: `BATCH-${(shipper?.branch_code || 'HCM').replace(/_/g, '')}`,
      shipper_id: shipperId,
      branch_code: shipper?.branch_code,
      store_name: branchInfo.store_name,
      store_address: branchInfo.store_address,
      store_latitude: branchInfo.latitude || 10.7834,
      store_longitude: branchInfo.longitude || 106.6802,
      total_orders: enrichedDeliveries.length,
      total_cod: enrichedDeliveries.reduce((sum, d) => sum + d.cod_amount, 0),
      total_fee: enrichedDeliveries.reduce((sum, d) => sum + d.delivery_fee, 0),
      status: 'IN_PROGRESS',
      created_at: new Date().toISOString(),
      deliveries: enrichedDeliveries,
    };

    if (this.redisCacheService) {
      await this.redisCacheService.setJson(`shipper:batch:${shipperId}`, batch, 86400).catch(() => {});
    }

    return { active: true, batch };
  }

  async cancelBatch(shipperId: string, batchId?: string) {
    await this.deliveryRepo.update(
      { shipper_id: shipperId, is_batched: true },
      { is_batched: false }
    );
    if (this.redisCacheService) {
      await this.redisCacheService.delete(`shipper:batch:${shipperId}`).catch(() => {});
    }
    this.notificationGateway.phatSongDonHangChoShipper({
      action: 'BATCH_CANCELLED',
      batchId,
      shipperId,
    });
    return {
      success: true,
      message: 'Đã hủy nhóm ghép đơn. Các đơn hàng đã được tách ra để giao riêng lẻ.',
    };
  }

  /**
   * GET /shippers/cod-remits?branch_code=XXX&status=PENDING
   * Admin xem danh sách các lần nộp COD (lọc theo chi nhánh, trạng thái)
   */
  async getCodRemits(branchCode?: string, status?: string) {
    const query = this.codRemitRepo.createQueryBuilder('r').orderBy('r.created_at', 'DESC');
    if (branchCode) query.andWhere('r.branch_code = :branchCode', { branchCode });
    if (status) query.andWhere('r.status = :status', { status });
    return query.getMany();
  }

  /**
   * POST /shippers/cod-remits/:remitId/confirm
   * Admin xác nhận đã nhận tiền mặt từ shipper → xóa nợ COD khỏi ví shipper
   */
  async confirmCodRemit(remitId: string, confirmedBy: string, action: 'CONFIRMED' | 'REJECTED') {
    const remit = await this.codRemitRepo.findOne({ where: { id: remitId } });
    if (!remit) throw new NotFoundException('Không tìm thấy phiếu nộp COD.');
    if (remit.status !== 'PENDING') throw new BadRequestException('Phiếu này đã được xử lý rồi.');

    const isUuid = Boolean(confirmedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(confirmedBy));
    const confirmedByUuid = isUuid ? confirmedBy : null;

    await this.codRemitRepo.update(remit.id, {
      status: action,
      confirmed_by: confirmedByUuid as any,
      confirmed_at: new Date(),
    });

    if (action === 'REJECTED') {
      // HOÀN LẠI TIỀN cho shipper (vì admin từ chối phiếu nộp)
      const wallet = await this.walletRepo.findOne({ where: { shipper_id: remit.shipper_id } });
      if (wallet) {
        wallet.cod_holding = Number(wallet.cod_holding) + Number(remit.amount);
        
        if (typeof wallet.cod_details === 'object' && wallet.cod_details !== null && remit.branch_code !== 'LEGACY_COD') {
          const currentDetails = { ...wallet.cod_details };
          const currentBranchCod = Number(currentDetails[remit.branch_code] || 0);
          currentDetails[remit.branch_code] = currentBranchCod + Number(remit.amount);
          wallet.cod_details = currentDetails;
        }

        await this.walletRepo.save(wallet);
      }
    }

    return {
      success: true,
      message: action === 'CONFIRMED'
        ? `Đã xác nhận nhận ${Number(remit.amount).toLocaleString('vi-VN')}đ từ ${remit.shipper_name}.`
        : `Đã từ chối phiếu nộp COD của ${remit.shipper_name}.`,
    };
  }
}
